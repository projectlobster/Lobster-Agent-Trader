import { SettingsForm, type KitHealth, type SettingsView } from "@/components/console/SettingsForm";
import { CredentialsForm } from "@/components/console/CredentialsForm";
import { Section } from "@/components/console/Section";
import { authStatus, health, systemStatus } from "@/lib/kit/query";
import { readCredentialsStatus } from "@/lib/kit/credentials";
import { kitLocation } from "@/lib/kit/locate";
import { MODEL_PRICES } from "@/lib/llm";
import { lintSettings } from "@/lib/settings-lint";
import { HOSTS, envPinnedFields, publicSettings, readSettings } from "@/lib/store/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = readSettings();
  const location = kitLocation();
  const credentials = readCredentialsStatus();

  let kitHealth: KitHealth = { ...location, health: null, auth: null };

  if (location.installed) {
    // Pass the selected deployment through, otherwise the auth card below
    // reports the kit's default host and a user who just switched to
    // Robinhood would be told their credentials are missing from a host they
    // are no longer using.
    const host = settings.kit.host || undefined;
    const [healthResult, authResult, systemResult] = await Promise.allSettled([
      health(),
      authStatus({ host }),
      systemStatus(),
    ]);
    kitHealth = {
      ...location,
      health: healthResult.status === "fulfilled" ? healthResult.value : null,
      healthError: healthResult.status === "rejected" ? String(healthResult.reason) : null,
      auth: authResult.status === "fulfilled" ? authResult.value : null,
      authError: authResult.status === "rejected" ? String(authResult.reason) : null,
      system: systemResult.status === "fulfilled" ? systemResult.value : null,
    };
  }

  const view = publicSettings(settings) as unknown as SettingsView;
  const envPinned = envPinnedFields();

  return (
    <div className="flex flex-col gap-8 pt-8">
      <Section
        label="Settings"
        title="Budget, model and connections"
        description="Everything is stored in this project's own SQLite file. Keys are never echoed back to the browser, and environment variables always take precedence."
      >
        <SettingsForm
          initial={view}
          models={MODEL_PRICES}
          hosts={HOSTS}
          kit={kitHealth}
          envLiveEnabled={process.env.LIGHTER_ENABLE_LIVE === "1"}
          envPinned={envPinned}
          initialWarnings={lintSettings(settings)}
        />
      </Section>

      <Section
        label="Lighter"
        title="Exchange credentials"
        description="The private key goes straight to the file the agent kit reads, outside this project. It is never stored in the database and never returned to the browser."
      >
        <CredentialsForm initial={credentials} auth={kitHealth.auth ?? null} />
      </Section>
    </div>
  );
}
