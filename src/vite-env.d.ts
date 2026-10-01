/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_ENDPOINT: string;
  readonly VITE_LINKEDIN_ENDPOINT: string;
  readonly VITE_EMAIL_ENDPOINT: string;
  readonly VITE_FORM_ENDPOINT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
