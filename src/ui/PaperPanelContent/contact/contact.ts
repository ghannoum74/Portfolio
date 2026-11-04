import contactHtml from "./contact.html?raw";
import { PROFILE } from "../../../data/profile";

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
    github.href = import.meta.env.VITE_GITHUB_ENDPOINT || PROFILE.githubUrl;
  }

  if (linkedin) {
    linkedin.href = import.meta.env.VITE_LINKEDIN_ENDPOINT || PROFILE.linkedinUrl;
  }

  if (email) {
    const address = import.meta.env.VITE_EMAIL_ENDPOINT || PROFILE.email;
    email.href = `mailto:${address}`;
    const label = email.querySelector("strong");
    if (label) label.textContent = address;
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

    const endpoint = import.meta.env.VITE_FORM_ENDPOINT;
    if (!endpoint) {
      status.textContent = "The form is unavailable. Please use the email link above to get in touch.";
      status.dataset.state = "error";
      return;
    }

    submitButton.disabled = true;

    submitButton.textContent = "SENDING...";

    status.textContent = "Sending your message...";

    status.dataset.state = "loading";

    try {
      const response = await fetch(endpoint, {
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

      status.textContent = "Thanks for your message. I'll get back to you soon.";

      status.dataset.state = "success";
    } catch {
      status.textContent =
        "Your message could not be sent. Please try again or use the email link above.";

      status.dataset.state = "error";
    } finally {
      submitButton.disabled = false;

      submitButton.innerHTML = `SEND MESSAGE <span aria-hidden="true">→</span>`;
    }
  });
}
