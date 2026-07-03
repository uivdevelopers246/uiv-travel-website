declare module "mjml" {
  export default function mjml2html(
    input: string,
    options?: { validationLevel?: "strict" | "soft" | "skip" },
  ): {
    html: string;
    errors: Array<{ message: string }>;
  };
}
