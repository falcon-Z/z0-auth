import type { AppConfig, ConfigErrorReason } from "./config";
import { ConfigError, loadConfig, requestPublicOrigin } from "./config";
import { getSmtpEnvCredentials, isSmtpEnvDisabled, isSmtpEnvManaged } from "./smtp-env";

export type ConfigurationIssue = {
  code: `config_${ConfigErrorReason}` | "config_invalid";
  variables: string[];
  message: string;
};

export type RuntimeConfiguration = {
  config: AppConfig;
  publicOrigin: string;
  smtpMode: "console" | "disabled" | "environment";
};

function safeIssue(error: unknown): ConfigurationIssue {
  if (error instanceof ConfigError) {
    return {
      code: `config_${error.reason}`,
      variables: error.variables,
      message: error.message,
    };
  }
  return {
    code: "config_invalid",
    variables: [],
    message: "Runtime configuration is invalid. Check the startup log.",
  };
}

/** Check every non-cryptographic setting that can be checked before the server listens. */
export function validateRuntimeConfiguration(): RuntimeConfiguration {
  const config = loadConfig();
  const publicOrigin = requestPublicOrigin(new Request("http://localhost"));
  getSmtpEnvCredentials();
  const smtpMode = isSmtpEnvDisabled()
    ? "disabled"
    : isSmtpEnvManaged()
      ? "environment"
      : "console";
  return { config, publicOrigin, smtpMode };
}

export function checkRuntimeConfiguration():
  | { ready: true; value: RuntimeConfiguration; issues: [] }
  | { ready: false; value: null; issues: ConfigurationIssue[] } {
  try {
    return { ready: true, value: validateRuntimeConfiguration(), issues: [] };
  } catch (error) {
    return { ready: false, value: null, issues: [safeIssue(error)] };
  }
}
