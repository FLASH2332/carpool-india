import { existsSync, readFileSync, writeFileSync } from "node:fs";
const path = new URL("../amplify_outputs.json", import.meta.url);
try {
  const supplied = process.env.AMPLIFY_OUTPUTS_JSON;
  if (!supplied && !existsSync(path))
    throw Error(
      "Copy Flash’s amplify_outputs.json to the repo root, or set AMPLIFY_OUTPUTS_JSON in Amplify Hosting. See docs/AWS_SETUP.md.",
    );
  const config = JSON.parse(supplied || readFileSync(path, "utf8"));
  if (
    config.auth?.aws_region !== "ap-south-1" ||
    config.data?.aws_region !== "ap-south-1" ||
    !config.auth?.user_pool_id ||
    !config.data?.model_introspection
  )
    throw Error(
      "Expected valid Amplify Gen 2 Auth and Data outputs for Mumbai (ap-south-1).",
    );
  if (supplied) writeFileSync(path, JSON.stringify(config, null, 2));
  console.log("Amplify Auth and Data configuration validated for Mumbai.");
} catch (error) {
  console.error(
    error instanceof SyntaxError
      ? "AMPLIFY_OUTPUTS_JSON is not valid JSON."
      : error.message,
  );
  process.exitCode = 1;
}
