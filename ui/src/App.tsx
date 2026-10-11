import { useState } from "react";
import { AppShell, Button, Card, EmptyState, Icon, Toast, SearchField, Dialog, useSessionUser, useListSearch } from "@gaudi/ui";
import "@gaudi/ui/styles.css";
import en from "./locales/en.json";
import ca from "./locales/ca.json";
import es from "./locales/es.json";
import { initGaudiI18n, useTranslation } from "@gaudi/ui/i18n";

initGaudiI18n({ en, ca, es });

/**
 * Vista de ejemplo estándar (UI-STANDARD.md + @gaudi/ui).
 * - AppShell sin h1 (topbar de plataforma ya muestra el nombre)
 * - useSessionUser() para identidad (nunca input manual de userId)
 * - Lista con SearchField + EmptyState + Dialog para destructivas
 */
export default function App() {
  const { t } = useTranslation();
  const { uid, email, loading: sessionLoading } = useSessionUser();
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [ok, setOk] = useState<string>("");
  const [showDialog, setShowDialog] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Example searchable list (greetings) — UI-STANDARD §5 SearchField required
  const greetings = result ? tryParseGreetings(result) : [];
  const search = useListSearch(greetings, (g: any) => `${g.id} ${g.message}`, { placeholder: t("common.searchPlaceholder") });
  const filtered = search.filtered;

  async function runAction(id: string, input: Record<string, unknown>) {
    setError("");
    setOk("");
    setResult(t("common.executing"));
    try {
      const res = await fetch(`api/actions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? res.statusText);
      else {
        setResult(JSON.stringify(data, null, 2));
        setOk(t("common.executed", { id }));
      }
    } catch (e) {
      setError(String(e));
    }
  }

  if (sessionLoading) {
    return (
      <AppShell>
        <Card>{t("common.loading")}</Card>
      </AppShell>
    );
  }

  if (!uid) {
    return (
      <AppShell>
        <EmptyState message={t("common.empty")} icon={<Icon name="user" size={28} />} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {ok && <Toast kind="ok">{ok}</Toast>}
      {error && <Toast kind="error">{error}</Toast>}

      <Card>
        <h2>Feature: {"calendar.scheduling"}</h2>
        <p className="gaudi-muted">Sesión: {email} ({uid.slice(0, 8)}...)</p>
        <div className="gaudi-flex" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Button onClick={() => runAction("scheduling.hello", { name: "world" })}>
            <Icon name="activity" size={18} /> hello
          </Button>
          <Button variant="ghost" onClick={() => runAction("scheduling.greetings.list", {})}>
            greetings.list
          </Button>
          <Button variant="ghost" onClick={() => runAction("scheduling.health", {})}>
            <Icon name="activity" size={18} /> health
          </Button>
        </div>
      </Card>

      <Card>
        <h3>{t("header.title")}</h3>
        <SearchField {...search.inputProps} />
        {filtered.length === 0 ? (
          <EmptyState message={search.query ? t("common.empty") : t("common.empty")} icon={<Icon name="search" size={28} />} />
        ) : (
          <ul>
            {filtered.map((g: any) => (
              <li key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: "44px" }}>
                <span>{g.message}</span>
                <Button
                  variant="ghost"
                  aria-label={`Borrar ${g.id}`}
                  onClick={() => {
                    setPendingDelete(g.id);
                    setShowDialog(true);
                  }}
                >
                  <Icon name="trash" size={18} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {result && (
        <Card>
          <h3>{t("common.result")}</h3>
          <pre style={{ fontFamily: "var(--gaudi-mono)", fontSize: 12, margin: 0, overflow: "auto" }}>{result}</pre>
        </Card>
      )}

      {!result && !error && <EmptyState message={t("common.empty")} icon={<Icon name="activity" size={28} />} />}

      <Dialog
        open={showDialog}
        title={pendingDelete ? t("common.executed", { id: pendingDelete }) : t("common.result")}
        confirmLabel={t("actions.hello")}
        danger
        onCancel={() => setShowDialog(false)}
        onConfirm={() => {
          setShowDialog(false);
          if (pendingDelete) runAction("scheduling.health", {}); // placeholder destructiva
        }}
      >
        {t("common.empty")}
      </Dialog>
    </AppShell>
  );
}

function tryParseGreetings(json: string): any[] {
  try {
    const data = JSON.parse(json);
    if (Array.isArray(data.greetings)) return data.greetings;
    if (data.greetings) return [data.greetings];
    return [];
  } catch {
    return [];
  }
}
