const API_BASE = "https://trainsapi.stepacademy.ge";
let trains = [];
let stations = [];
let cartItem = null;
let currentUser = null;
const app = document.querySelector("#app");

document.addEventListener("click", (event) => {
  if (event.target.closest(".brand")) {
    event.preventDefault();
    window.location.href = window.location.pathname;
  }
});

async function api(path, options = {}) {
  const token = localStorage.getItem("step_trains_token");
  const isAuthRequest = path.startsWith("/api/auth/");
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    mode: "cors",
    credentials: "omit",
    headers: { "Content-Type": "application/json", ...(!isAuthRequest && token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  if (!response.ok) {
    const errorText = await response.text();
    let errorBody = null;
    try { errorBody = errorText ? JSON.parse(errorText) : null; } catch (_) { /* The API may return plain text. */ }
    throw new Error(errorBody?.detail || errorBody?.title || errorText || `API request failed: ${response.status}`);
  }
  const responseText = await response.text();
  const headerToken = response.headers.get("authorization") || response.headers.get("x-api-key");
  if (!responseText) return headerToken ? { token: headerToken } : {};
  try {
    const parsed = JSON.parse(responseText);
    if (headerToken && parsed && typeof parsed === "object") parsed.headerToken = headerToken;
    return parsed;
  } catch (_) { return headerToken ? { message: responseText, headerToken } : { message: responseText }; }
}

function accountLabel() {
  if (!currentUser) return "Account";
  return [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || currentUser.email || "Account";
}

function extractToken(response) {
  const search = (value, key = "") => {
    if (typeof value === "string") {
      const text = value.trim();
      const keyLooksLikeToken = /token|jwt|access/i.test(key);
      const valueLooksLikeToken = key === "" || key === "data" || /result|value|authorization/i.test(key);
      if (text && (keyLooksLikeToken || text.split(".").length === 3 || (valueLooksLikeToken && text.length >= 20))) return text.replace(/^Bearer\s+/i, "").trim();
      return null;
    }
    if (!value || typeof value !== "object") return null;
    for (const [childKey, childValue] of Object.entries(value)) {
      const found = search(childValue, childKey);
      if (found) return found;
    }
    return null;
  };
  return search(response);
}

async function loadCurrentUser() {
  if (!localStorage.getItem("step_trains_token")) { currentUser = null; return; }
  try {
    const response = await api("/api/users/me");
    const user = response.data || response;
    const details = user.details || {};
    currentUser = { firstName: user.firstName || user.first_name || "", lastName: user.lastName || user.last_name || "", email: user.email || "", phoneNumber: details.phoneNumber || user.phoneNumber || "", address: details.address || user.address || "", dateOfBirth: details.dob || details.dateOfBirth || user.dateOfBirth || "", pictureUrl: details.pictureUrl || user.pictureUrl || "" };
  } catch (error) {
    // Keep the login token even when the optional profile request fails.
    // The booking API can still use the authenticated token.
  }
}

async function loadData() {
  app.innerHTML = `<div class="loading-screen"><div class="loader"></div><p>Loading train routes...</p></div>`;
  try {
    const [trainsResponse, stationsResponse] = await Promise.all([
      api("/api/trains?Take=50&Page=1"),
      api("/api/stations")
    ]);
    const list = trainsResponse.data?.items || [];
    stations = (stationsResponse.data || []).map((station) => station.name).sort();
    const details = await Promise.all(list.map((train) => api(`/api/trains/${train.id}`).catch(() => ({ data: train }))));
    trains = list.map((train, index) => {
      const detail = details[index].data || {};
      const schedules = detail.schedules || [];
      const firstSchedule = schedules[0] || {};
      return {
        ...train,
        ...detail,
        schedules,
        coaches: detail.coaches || [],
        from: firstSchedule.origin || "Route available",
        to: firstSchedule.destination || "See details",
        time: firstSchedule.departureTime ? firstSchedule.departureTime.slice(0, 5) : "Schedule available",
        duration: `${train.coachesCount || 0} coaches`,
        color: ["orange", "blue", "green", "red", "purple"][index % 5]
      };
    });
    await loadCurrentUser();
    render();
  } catch (error) {
    app.innerHTML = `<div class="api-error"><h1>Unable to load trains</h1><p>გთხოვთ, შეამოწმოთ ინტერნეტთან კავშირი და თავიდან გახსნათ გვერდი.</p><button class="btn primary" onclick="loadData()">Try again</button></div>`;
    console.error(error);
  }
}

function render() {
  app.innerHTML = `
    <div class="shell">
      <nav class="nav"><a class="brand" href="#"><span class="brand-mark" aria-hidden="true"><span class="logo-train">🚆</span></span><span>STEP<small> TRAINS</small></span></a><div class="nav-links" id="navLinks"><a href="#trains">Explore</a><a href="#about">About</a><a href="#contact">Contact</a><a class="get-started" href="#trains">Get started</a><button class="auth-button" id="authButton">${localStorage.getItem("step_trains_token") ? "Account" : "Log in"}</button></div><button class="auth-button mobile-auth" id="mobileAuthButton">${localStorage.getItem("step_trains_token") ? "Account" : "Log in"}</button><button class="menu" id="menuButton" aria-label="Toggle menu">☰</button></nav>
      <header class="hero"><div><p class="eyebrow">Explore Georgia by rail</p><h1>Your journey starts <em>here.</em></h1><p class="hero-copy">Discover comfortable train routes across Georgia. Find your next destination, choose your train, and enjoy the ride.</p></div><div class="hero-art"><div class="sun"></div><div class="rail"></div><div class="train-art">🚆</div></div></header>
      <main class="content" id="trains"><div class="layout"><aside class="filters"><h2>Find a train</h2><div class="field"><label for="search">Train name or number</label><input id="search" type="search" placeholder="e.g. Express, 42..." /></div><div class="field"><label for="from">From</label><select id="from"><option value="">Any origin</option>${stations.map((s) => `<option>${s}</option>`).join("")}</select></div><div class="field"><label for="to">To</label><select id="to"><option value="">Any destination</option>${stations.map((s) => `<option>${s}</option>`).join("")}</select></div><div class="actions"><button class="btn primary" id="apply">Search trains</button><button class="btn secondary" id="clear">Clear</button></div></aside><section><div class="results-head"><div><p class="eyebrow">Available routes</p><h2>Train routes</h2></div><span class="count" id="count"></span></div><div class="cards" id="cards"></div></section></div></main><footer id="contact">Made for curious travellers · <a href="https://ge.itstep.org" target="_blank">STEP Academy Georgia</a></footer></div><div class="modal-backdrop hidden" id="modalBackdrop"><article class="modal"><button class="modal-close" id="closeModal">×</button><p class="eyebrow">Route details</p><h2 id="modalTitle"></h2><div class="modal-route"><b id="modalFrom"></b><span>→</span><b id="modalTo"></b></div><p id="modalDescription"></p><div class="meta"><span id="modalTime"></span><span>60 seats · 3 coaches</span></div></article></div>`;
  document.querySelector(".content").insertAdjacentHTML("beforeend", `<section class="about-section" id="about"><div><p class="eyebrow">About STEP Trains</p><h2>Travel simply.<br><em>Arrive happy.</em></h2></div><div class="about-copy"><p>STEP Trains helps you discover train routes across Georgia and book your seat in just a few steps.</p><div class="about-points"><span><b>01</b> Explore real routes</span><span><b>02</b> Choose your seat</span><span><b>03</b> Book securely</span></div></div></section>`);
  document.querySelector(".content").insertAdjacentHTML("afterbegin", `<section class="welcome-banner"><p class="eyebrow">Welcome to STEP Trains</p><h1>Find your route.<br><em>Start your journey.</em></h1><p>Explore real train routes across Georgia, choose your seat and travel comfortably.</p><a class="btn primary" href="#trains">Explore trains</a></section>`);
  document.querySelector("#navLinks").insertAdjacentHTML("afterbegin", `<a href="#trains">Trains</a>`);
  document.querySelector(".layout > section").id = "train-list";
  document.querySelectorAll('a[href="#trains"]').forEach((link) => { link.href = "#train-list"; });
  document.querySelector(".hero")?.remove();
  document.querySelector(".filters h2").textContent = "Search";
  document.querySelector("label[for=search]").textContent = "Train number";
  document.querySelector("#search").placeholder = "e.g. Express, 42...";
  document.querySelector("#apply").textContent = "Apply Filter";
  document.querySelector(".results-head .eyebrow").textContent = "Explore";
  document.querySelector(".results-head h2").textContent = "Train Routes";
  document.querySelector(".results-head h2").insertAdjacentHTML("afterend", "<p class='page-subtitle'>Find trains by name, or filter by origin and destination.</p>");
  document.querySelector("footer").innerHTML = `<a href="https://ge.itstep.org" target="_blank">Created By It Step Academy Georgia</a>`;
  document.querySelector(".nav").insertAdjacentHTML("beforeend", `<button class="cart-button" id="cartButton" type="button">Cart <span id="cartCount">${cartItem?.seatIds?.length || 0}</span></button>`);
  bindEvents();
  updateCards();
}

function updateCards() {
  const query = document.querySelector("#search").value.trim().toLowerCase();
  const from = document.querySelector("#from").value;
  const to = document.querySelector("#to").value;
  const filtered = trains.filter((train) => {
    const schedules = train.schedules || [];
    const matchesSearch = !query || `${train.name} ${train.number}`.toLowerCase().includes(query);
    const matchesOrigin = !from || train.from === from || schedules.some((schedule) => schedule.origin === from);
    const matchesDestination = !to || train.to === to || schedules.some((schedule) => schedule.destination === to);
    const matchesRoute = (!from || !to) || schedules.some((schedule) => schedule.origin === from && schedule.destination === to);
    return matchesSearch && matchesOrigin && matchesDestination && matchesRoute;
  });
  document.querySelector("#count").textContent = `${filtered.length} ${filtered.length === 1 ? "train" : "trains"} found`;
  document.querySelector("#cards").innerHTML = filtered.length ? filtered.map((train) => `<article class="card" data-id="${train.id}"><div class="card-cover ${train.color}"><img class="train-photo" src="${train.thumbnail || ""}" alt="${train.name}" onerror="this.style.display='none'"><div class="photo-overlay"></div><span class="route-tag">#${train.number} · ${train.coachesCount || train.coaches?.length || 0} coaches</span></div><div class="card-body"><div class="card-top"><h3>${train.name}</h3><span class="number">#${train.number}</span></div><p class="route">${train.from}<br>↓<br>${train.to}</p><div class="meta"><span>${train.time}</span><span>${train.totalSeats || 0} seats</span></div></div></article>`).join("") : `<div class="empty">No trains match your search. Try another route.</div>`;
  document.querySelectorAll(".card").forEach((card) => card.addEventListener("click", () => openModal(Number(card.dataset.id))));
}

function openModal(id) {
  const train = trains.find((item) => item.id === id);
  document.querySelector("#modalTitle").textContent = `${train.name} #${train.number}`;
  document.querySelector("#modalFrom").textContent = train.from.replace(" Station", "");
  document.querySelector("#modalTo").textContent = train.to.replace(" Station", "");
  document.querySelector("#modalDescription").textContent = `${train.schedules?.length || 0} scheduled routes and ${train.coaches?.length || train.coachesCount || 0} coaches are available for this train.`;
  document.querySelector("#modalTime").textContent = `${train.time} · ${train.duration}`;
  document.querySelector("#modalBackdrop").classList.remove("hidden");
}

function bindEvents() {
  document.querySelector(".brand").addEventListener("click", (event) => { event.preventDefault(); window.location.reload(); });
  document.querySelector("#apply").addEventListener("click", updateCards);
  document.querySelector("#search").addEventListener("input", updateCards);
  document.querySelector("#clear").addEventListener("click", () => { document.querySelector("#search").value = ""; document.querySelector("#from").value = ""; document.querySelector("#to").value = ""; updateCards(); });
  document.querySelector("#closeModal").addEventListener("click", () => document.querySelector("#modalBackdrop").classList.add("hidden"));
  document.querySelector("#modalBackdrop").addEventListener("click", (event) => { if (event.target.id === "modalBackdrop") event.currentTarget.classList.add("hidden"); });
  document.querySelector("#menuButton").addEventListener("click", () => document.querySelector("#navLinks").classList.toggle("open"));
}

loadData();

function openModal(id) {
  const train = trains.find((item) => item.id === id);
  const modal = document.querySelector("#modalBackdrop .modal");
  const schedules = train.schedules || [];
  modal.innerHTML = `<button class="modal-close" id="closeModal">×</button><p class="eyebrow">Route details</p><h2>${train.name} #${train.number}</h2><div class="modal-route"><b>${train.from.replace(" Station", "")}</b><span>→</span><b>${train.to.replace(" Station", "")}</b></div><p>${schedules.length} scheduled routes and ${train.coaches?.length || train.coachesCount || 0} coaches are available.</p><div class="booking-tools"><div class="field"><label for="scheduleSelect">Route and departure</label><select id="scheduleSelect">${schedules.map((schedule) => `<option value="${schedule.id}">${schedule.origin} → ${schedule.destination} · ${schedule.departureTime.slice(0, 5)}</option>`).join("")}</select></div><div class="field"><label for="travelDate">Travel date</label><input id="travelDate" type="date" min="${new Date().toISOString().slice(0, 10)}" value="${new Date().toISOString().slice(0, 10)}" /></div><div class="field"><label for="coachSelect">Choose a coach</label><select id="coachSelect">${(train.coaches || []).map((coach) => `<option value="${coach.id}">Coach ${coach.number} · ${coach.class} · ${coach.price} ₾</option>`).join("")}</select></div><div id="seatList" class="seat-list"><p>Choose a date and coach to see available seats.</p></div><button class="btn primary" id="bookButton">Book selected seats</button><p id="bookingMessage" class="form-message"></p></div><div class="meta"><span>${train.time}</span><span>${train.totalSeats || 0} seats</span></div>`;
  const backdrop = document.querySelector("#modalBackdrop");
  backdrop.classList.remove("hidden");
  modal.querySelector("#closeModal").addEventListener("click", () => backdrop.classList.add("hidden"));
  modal.querySelector("#scheduleSelect").addEventListener("change", () => loadSeats(train));
  modal.querySelector("#travelDate").addEventListener("change", () => loadSeats(train));
  modal.querySelector("#coachSelect").addEventListener("change", () => loadSeats(train));
  modal.querySelector("#bookButton").textContent = "Add to cart";
  modal.querySelector("#bookButton").addEventListener("click", () => addToCart(train));
  loadSeats(train);
}

async function loadSeats(train) {
  const modal = document.querySelector("#modalBackdrop .modal");
  const scheduleId = modal.querySelector("#scheduleSelect")?.value;
  const coachId = modal.querySelector("#coachSelect")?.value;
  const travelDate = modal.querySelector("#travelDate")?.value;
  const seatList = modal.querySelector("#seatList");
  if (!scheduleId || !coachId || !travelDate) return;
  seatList.innerHTML = "<p>Loading seats...</p>";
  try {
    const response = await api(`/api/seats/availability?scheduleId=${scheduleId}&coachId=${coachId}&travelDate=${encodeURIComponent(`${travelDate}T00:00:00Z`)}`);
    const seats = response.data || [];
    seatList.innerHTML = seats.length ? seats.map((seat) => `<button class="seat ${seat.isAvailable ? "available" : "occupied"}" data-seat-id="${seat.id}" ${seat.isAvailable ? "" : "disabled"}>${seat.number}</button>`).join("") : "<p>No seats found for this coach.</p>";
    seatList.querySelectorAll(".available").forEach((seat) => seat.addEventListener("click", () => { seat.classList.toggle("selected"); updateBookingSummary(); }));
  } catch (error) {
    seatList.innerHTML = "<p>Seats could not be loaded. Please select another date.</p>";
  }
}

function updateBookingSummary() {
  const modal = document.querySelector("#modalBackdrop .modal");
  const summary = modal?.querySelector("#bookingSummary strong");
  if (!summary) return;
  const selected = [...modal.querySelectorAll(".seat.selected")].map((seat) => seat.textContent.trim());
  summary.textContent = selected.length ? `${selected.length} seat${selected.length > 1 ? "s" : ""}: ${selected.join(", ")}` : "No seats selected";
  const cartCount = document.querySelector("#cartCount");
  if (cartCount) cartCount.textContent = selected.length;
}

function addToCart(train) {
  const modal = document.querySelector("#modalBackdrop .modal");
  const seats = [...modal.querySelectorAll(".seat.selected")].map((seat) => Number(seat.dataset.seatId));
  const message = modal.querySelector("#bookingMessage");
  if (!seats.length) { message.textContent = "Select at least one available seat."; return; }
  cartItem = { trainId: train.id, trainName: train.name, scheduleId: Number(modal.querySelector("#scheduleSelect").value), coachId: Number(modal.querySelector("#coachSelect").value), seatIds: seats, seatNames: [...modal.querySelectorAll(".seat.selected")].map((seat) => seat.textContent.trim()), travelDate: `${modal.querySelector("#travelDate").value}T00:00:00Z` };
  const cartCount = document.querySelector("#cartCount");
  if (cartCount) cartCount.textContent = seats.length;
  if (history.state?.trainId === train.id) history.back();
  else document.querySelector("#modalBackdrop")?.classList.add("hidden");
}

function openCart() {
  const backdrop = document.querySelector("#modalBackdrop");
  const modal = backdrop.querySelector(".modal");
  if (!cartItem) { modal.innerHTML = `<button class="modal-close" id="closeCart">×</button><p class="eyebrow">Your cart</p><h2>Your cart is empty</h2><p>Select a train and an available seat to add it here.</p>`; }
  else { modal.innerHTML = `<button class="modal-close" id="closeCart">×</button><p class="eyebrow">Your cart</p><h2>${cartItem.trainName}</h2><p>Coach ${cartItem.coachId} · Seats: ${cartItem.seatNames.join(", ")}</p><p>Travel date: ${cartItem.travelDate.slice(0, 10)}</p><button class="btn primary" id="checkoutButton">Complete booking</button><p id="cartMessage" class="form-message"></p>`; }
  backdrop.classList.remove("hidden");
  modal.querySelector("#closeCart").onclick = () => backdrop.classList.add("hidden");
  modal.querySelector("#checkoutButton")?.addEventListener("click", submitCartBooking);
}

async function submitCartBooking() {
  const message = document.querySelector("#cartMessage");
  if (!localStorage.getItem("step_trains_token")) { message.textContent = "Log in first — your selected seat is saved in the cart."; openAuthModal(); return; }
  try { await api("/api/bookings", { method: "POST", body: JSON.stringify({ scheduleId: cartItem.scheduleId, seatId: cartItem.seatIds, travelDate: cartItem.travelDate }) }); cartItem = null; document.querySelector("#cartCount").textContent = "0"; message.textContent = "Booking created successfully."; message.classList.add("success"); } catch (error) { if (error.message.includes("401") || error.message.includes("403")) { localStorage.removeItem("step_trains_token"); message.textContent = "Your login session expired. Please log in again."; openAuthModal(); } else { message.textContent = `Booking failed: ${error.message}`; } }
}

async function createBooking(train) {
  const token = localStorage.getItem("step_trains_token");
  const message = document.querySelector("#bookingMessage");
  if (!token) { message.textContent = "Please log in before booking."; openAuthModal(); return; }
  const modal = document.querySelector("#modalBackdrop .modal");
  const seats = [...modal.querySelectorAll(".seat.selected")].map((seat) => Number(seat.dataset.seatId));
  if (!seats.length) { message.textContent = "Select at least one available seat."; return; }
  try {
    await api("/api/bookings", { method: "POST", body: JSON.stringify({ scheduleId: Number(modal.querySelector("#scheduleSelect").value), seatId: seats, travelDate: `${modal.querySelector("#travelDate").value}T00:00:00Z` }) });
    message.textContent = "Booking created successfully.";
    message.classList.add("success");
  } catch (error) {
    if (error.message.includes("401") || error.message.includes("403")) {
      localStorage.removeItem("step_trains_token");
      message.textContent = "Your login session expired. Please log in again.";
      openAuthModal();
    } else {
      message.textContent = `Booking failed: ${error.message}`;
    }
  }
}

function openAuthModal() {
  if (!document.querySelector("#authBackdrop")) document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" id="authBackdrop"><article class="modal auth-modal"><button class="modal-close" id="closeAuth">×</button><p class="eyebrow">STEP Trains account</p><h2 id="authTitle">Log in</h2><form id="authForm"><div id="registerFields" class="hidden"><div class="field"><label>First name</label><input id="firstName" /></div><div class="field"><label>Last name</label><input id="lastName" /></div></div><div class="field"><label>Email</label><input id="email" type="email" required /></div><div class="field"><label>Password</label><input id="password" type="password" required /></div><button class="btn primary" type="submit">Log in</button><p id="authMessage" class="form-message"></p></form><button class="text-button" id="toggleAuth" type="button">Create an account</button></article></div>`);
  const backdrop = document.querySelector("#authBackdrop");
  backdrop.classList.remove("hidden");
  const form = backdrop.querySelector("#authForm");
  const toggle = backdrop.querySelector("#toggleAuth");
  let register = false;
  const closeAuth = backdrop.querySelector("#closeAuth");
  closeAuth.onclick = (event) => { event.preventDefault(); event.stopPropagation(); backdrop.classList.add("hidden"); };
  backdrop.onclick = (event) => { if (event.target === backdrop) backdrop.classList.add("hidden"); };
  toggle.onclick = () => { register = !register; backdrop.querySelector("#authTitle").textContent = register ? "Create account" : "Log in"; backdrop.querySelector("#registerFields").classList.toggle("hidden", !register); form.querySelector("button").textContent = register ? "Register" : "Log in"; toggle.textContent = register ? "I already have an account" : "Create an account"; };
  form.onsubmit = async (event) => { event.preventDefault(); const message = backdrop.querySelector("#authMessage"); const body = register ? { firstName: backdrop.querySelector("#firstName").value, lastName: backdrop.querySelector("#lastName").value, email: backdrop.querySelector("#email").value, password: backdrop.querySelector("#password").value } : { email: backdrop.querySelector("#email").value, password: backdrop.querySelector("#password").value }; try { const response = await api(register ? "/api/auth/register" : "/api/auth/login", { method: "POST", body: JSON.stringify(body) }); const token = extractToken(response); if (register) { message.textContent = "Registration successful. Verify your email, then log in."; } else if (token) { localStorage.setItem("step_trains_token", token); currentUser = { email: body.email }; await loadCurrentUser(); backdrop.classList.add("hidden"); render(); if (cartItem) setTimeout(openCart, 0); } else message.textContent = response.message || "Login succeeded, but the API did not return a JWT token."; } catch (error) { message.textContent = error.name === "TypeError" ? "API connection failed. Please open the project through Live Server or check your internet connection." : error.message === "Invalid email or password." ? "Invalid email or password. If you just registered, verify your email first." : error.message; } };
}

function openAccountModal() {
  if (!currentUser) { openAuthModal(); return; }
  const dateOfBirth = currentUser.dateOfBirth ? new Date(currentUser.dateOfBirth).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "Not provided";
  if (!document.querySelector("#accountBackdrop")) document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" id="accountBackdrop"><article class="modal auth-modal account-modal"><button class="modal-close" id="closeAccount">×</button><p class="eyebrow">STEP Trains account</p><h2>${accountLabel()}</h2><div class="profile-grid"><div><span>First name</span><strong>${currentUser.firstName || "Not provided"}</strong></div><div><span>Last name</span><strong>${currentUser.lastName || "Not provided"}</strong></div><div><span>Email</span><strong>${currentUser.email || "Not provided"}</strong></div><div><span>Phone</span><strong>${currentUser.phoneNumber || "Not provided"}</strong></div><div><span>Date of birth</span><strong>${dateOfBirth}</strong></div><div><span>Address</span><strong>${currentUser.address || "Not provided"}</strong></div></div><p class="account-note">Your profile is ready for booking train tickets.</p><button class="btn secondary" id="logoutButton" type="button">Log out</button></article></div>`);
  const backdrop = document.querySelector("#accountBackdrop");
  backdrop.classList.remove("hidden");
  backdrop.querySelector("#closeAccount").onclick = () => backdrop.classList.add("hidden");
  backdrop.onclick = (event) => { if (event.target === backdrop) backdrop.classList.add("hidden"); };
  backdrop.querySelector("#logoutButton").onclick = () => { localStorage.removeItem("step_trains_token"); currentUser = null; backdrop.classList.add("hidden"); render(); };
}

function bindEvents() {
  document.querySelector("#apply").addEventListener("click", updateCards);
  document.querySelector("#search").addEventListener("input", updateCards);
  document.querySelector("#clear").addEventListener("click", () => { document.querySelector("#search").value = ""; document.querySelector("#from").value = ""; document.querySelector("#to").value = ""; updateCards(); });
  document.querySelector("#closeModal").addEventListener("click", () => document.querySelector("#modalBackdrop").classList.add("hidden"));
  document.querySelector("#modalBackdrop").addEventListener("click", (event) => { if (event.target.id === "modalBackdrop") event.currentTarget.classList.add("hidden"); });
  document.querySelector("#menuButton").addEventListener("click", () => document.querySelector("#navLinks").classList.toggle("open"));
  const authAction = currentUser ? openAccountModal : openAuthModal;
  if (currentUser) { document.querySelector("#authButton").textContent = "Account"; document.querySelector("#mobileAuthButton").textContent = "Account"; }
  document.querySelector("#authButton").addEventListener("click", authAction);
  document.querySelector("#mobileAuthButton").addEventListener("click", authAction);
  document.querySelector("#cartButton").addEventListener("click", openCart);
}

// Keep train details in browser history so Back and Forward work naturally.
const openTrainDetails = openModal;
openModal = function (id) {
  if (history.state?.trainId !== id) history.pushState({ trainId: id }, "", `#train-${id}`);
  openTrainDetails(id);
  document.body.classList.add("train-modal-open");
  const modal = document.querySelector("#modalBackdrop .modal");
  const seatList = modal?.querySelector("#seatList");
  if (seatList && !modal.querySelector("#bookingSummary")) seatList.insertAdjacentHTML("afterend", `<div class="booking-summary" id="bookingSummary"><span>Your cart</span><strong>No seats selected</strong></div>`);
  if (modal && !modal.querySelector(".back-to-trains")) modal.insertAdjacentHTML("afterbegin", `<button class="back-to-trains" type="button">← Back to trains</button>`);
  modal?.querySelector(".back-to-trains")?.addEventListener("click", () => { if (history.state?.trainId === id) history.back(); else document.querySelector("#modalBackdrop")?.classList.add("hidden"); }, { once: true });
  const closeButton = document.querySelector("#modalBackdrop .modal-close");
  if (closeButton) closeButton.addEventListener("click", () => { if (history.state?.trainId === id) history.back(); }, { once: true });
};

window.addEventListener("popstate", (event) => {
  const backdrop = document.querySelector("#modalBackdrop");
  if (event.state?.trainId) openTrainDetails(event.state.trainId);
  else { backdrop?.classList.add("hidden"); document.body.classList.remove("train-modal-open"); }
});
