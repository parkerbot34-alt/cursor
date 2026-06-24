// agents.json — the transactability manifest. Discoverability tells an AI the
// business exists; this tells the AI what it can *do* and exactly how to do it,
// so an agent can act on a customer's behalf (get a quote, book, order, contact).
//
// The shape is inspired by the emerging agents.json convention but kept
// deliberately simple and self-describing. We don't over-claim conformance to
// any single spec — we emit something an agent can read and act on today.

import type { AgentAction, BusinessProfile } from "../types.ts";
import { prune } from "../util.ts";

// Every business gets at least a "contact" action derived from its details, so
// the manifest is never empty even when no explicit actions were supplied.
function defaultActions(p: BusinessProfile): AgentAction[] {
  const actions: AgentAction[] = [];
  if (p.email) {
    actions.push({
      name: "Contact by email",
      kind: "contact",
      description: `Email ${p.name} directly.`,
      endpoint: `mailto:${p.email}`,
      method: "GET",
      params: [
        { name: "subject", type: "string", required: false },
        { name: "body", type: "string", required: false },
      ],
    });
  }
  if (p.phone) {
    actions.push({
      name: "Call",
      kind: "contact",
      description: `Phone ${p.name}.`,
      endpoint: `tel:${p.phone.replace(/[^+\d]/g, "")}`,
      method: "GET",
    });
  }
  return actions;
}

export function buildAgentsJson(p: BusinessProfile): object {
  const actions = [...(p.actions ?? []), ...defaultActions(p)];
  return prune({
    schemaVersion: "beacon/0.1",
    business: {
      name: p.name,
      url: p.url,
      agentUrl: p.agentUrl,
      description: p.description,
    },
    // Where an agent can pull authoritative structured facts.
    resources: prune({
      profile: "/api/business.json",
      services: p.services?.length ? "/api/services.json" : undefined,
      llms: "/llms.txt",
      llmsFull: "/llms-full.txt",
    }),
    actions: actions.map((a) =>
      prune({
        name: a.name,
        kind: a.kind,
        description: a.description,
        endpoint: a.endpoint,
        method: a.method ?? "POST",
        parameters: a.params?.map((param) =>
          prune({
            name: param.name,
            type: param.type,
            required: param.required,
            description: param.description,
          }),
        ),
      }),
    ),
  });
}
