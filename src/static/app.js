document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const emailInput = document.getElementById("email");
  const messageDiv = document.getElementById("message");
  const authMessageDiv = document.getElementById("auth-message");
  const loginForm = document.getElementById("login-form");
  const logoutButton = document.getElementById("logout-btn");
  const authStatus = document.getElementById("auth-status");

  let token = localStorage.getItem("authToken") || "";
  let currentUser = null;

  function showMessage(targetDiv, text, type) {
    targetDiv.textContent = text;
    targetDiv.className = type;
    targetDiv.classList.remove("hidden");

    setTimeout(() => {
      targetDiv.classList.add("hidden");
    }, 5000);
  }

  function getAuthHeaders() {
    if (!token) {
      return {};
    }

    return {
      Authorization: `Bearer ${token}`,
    };
  }

  function updateAuthUI() {
    if (!currentUser) {
      authStatus.textContent = "Not logged in";
      loginForm.classList.remove("hidden");
      logoutButton.classList.add("hidden");

      signupForm.querySelector("button[type='submit']").disabled = true;
      emailInput.value = "";
      emailInput.readOnly = false;
      emailInput.placeholder = "Log in to register";
      return;
    }

    authStatus.textContent = `Logged in as ${currentUser.username} (${currentUser.role})`;
    loginForm.classList.add("hidden");
    logoutButton.classList.remove("hidden");
    signupForm.querySelector("button[type='submit']").disabled = false;

    if (currentUser.role === "admin") {
      emailInput.readOnly = false;
      emailInput.placeholder = "student-email@mergington.edu";
      emailInput.value = "";
    } else {
      emailInput.readOnly = true;
      emailInput.value = currentUser.email;
    }
  }

  async function hydrateSession() {
    if (!token) {
      updateAuthUI();
      return;
    }

    try {
      const response = await fetch("/auth/me", {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Session expired");
      }

      currentUser = await response.json();
      updateAuthUI();
    } catch (error) {
      token = "";
      currentUser = null;
      localStorage.removeItem("authToken");
      updateAuthUI();
    }
  }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";
      activitySelect.innerHTML =
        '<option value="">-- Select an activity --</option>';

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        // Create participants HTML with delete icons instead of bullet points
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) =>
                      `<li><span class="participant-email">${email}</span>${
                        currentUser && currentUser.role === "admin"
                          ? `<button class="delete-btn" data-activity="${name}" data-email="${email}">❌</button>`
                          : ""
                      }</li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      // Add event listeners to delete buttons
      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle unregister functionality
  async function handleUnregister(event) {
    if (!currentUser) {
      showMessage(authMessageDiv, "Please log in first.", "error");
      return;
    }

    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(messageDiv, result.message, "success");

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage(messageDiv, result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage(messageDiv, "Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        showMessage(authMessageDiv, result.detail || "Login failed", "error");
        return;
      }

      token = result.token;
      currentUser = result.user;
      localStorage.setItem("authToken", token);
      loginForm.reset();
      updateAuthUI();
      fetchActivities();
      showMessage(authMessageDiv, "Login successful", "success");
    } catch (error) {
      showMessage(authMessageDiv, "Failed to log in. Please try again.", "error");
      console.error("Error logging in:", error);
    }
  });

  logoutButton.addEventListener("click", async () => {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        headers: getAuthHeaders(),
      });
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      token = "";
      currentUser = null;
      localStorage.removeItem("authToken");
      updateAuthUI();
      fetchActivities();
      showMessage(authMessageDiv, "Logged out", "info");
    }
  });

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!currentUser) {
      showMessage(authMessageDiv, "Please log in first.", "error");
      return;
    }

    const email = emailInput.value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        showMessage(messageDiv, result.message, "success");

        if (currentUser.role === "admin") {
          signupForm.reset();
        }

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        showMessage(messageDiv, result.detail || "An error occurred", "error");
      }
    } catch (error) {
      showMessage(messageDiv, "Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  // Initialize app
  hydrateSession();
  updateAuthUI();
  fetchActivities();
});
