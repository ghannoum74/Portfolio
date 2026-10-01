import contactHtml from "./contact.html?raw";

import "./contact.css";

export function createContactContent(): DocumentFragment {
  const template = document.createElement("template");

  template.innerHTML = contactHtml.trim();

  const fragment = template.content.cloneNode(true) as DocumentFragment;

  setupSocialLinks(fragment);

  setupContactForm(fragment);

  return fragment;
}

function setupSocialLinks(fragment: DocumentFragment): void {
  const github = fragment.querySelector<HTMLAnchorElement>(
    "[data-contact-github]",
  );

  const linkedin = fragment.querySelector<HTMLAnchorElement>(
    "[data-contact-linkedin]",
  );

  const email = fragment.querySelector<HTMLAnchorElement>(
    "[data-contact-email]",
  );

  if (github) {
    github.href = import.meta.env.VITE_GITHUB_ENDPOINT;
  }

  if (linkedin) {
    linkedin.href = import.meta.env.VITE_LINKEDIN_ENDPOINT;
  }

  if (email) {
    email.href = `mailto:${import.meta.env.VITE_EMAIL_ENDPOINT}`;
  }
}

function setupContactForm(fragment: DocumentFragment): void {
  const form = fragment.querySelector<HTMLFormElement>("[data-contact-form]");

  const status = fragment.querySelector<HTMLElement>("[data-contact-status]");

  const submitButton = fragment.querySelector<HTMLButtonElement>(
    "[data-contact-submit]",
  );

  if (!form || !status || !submitButton) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) {
      return;
    }

    submitButton.disabled = true;

    submitButton.textContent = "SENDING...";

    status.textContent = "Your letter is travelling...";

    status.dataset.state = "loading";

    try {
      const response = await fetch(import.meta.env.VITE_FORM_ENDPOINT, {
        method: "POST",

        body: new FormData(form),

        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Unable to send message");
      }

      form.reset();

      status.textContent = "Letter delivered. I'll get back to you soon.";

      status.dataset.state = "success";
    } catch {
      status.textContent =
        "The carrier pigeon got lost. Try again or use email.";

      status.dataset.state = "error";
    } finally {
      submitButton.disabled = false;

      submitButton.innerHTML = `SEND LETTER <span aria-hidden="true">→</span>`;
    }
  });
}
