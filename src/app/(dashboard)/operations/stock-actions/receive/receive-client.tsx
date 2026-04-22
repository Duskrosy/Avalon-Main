"use client";

import {
  GuidedMovementWorkflow,
  type InventoryLocation,
  type WorkflowConfig,
} from "@/components/inventory/guided-movement-workflow";

const config: WorkflowConfig = {
  title: "Receive stock",
  description:
    "Record new inventory arriving at FCRC. Use this only for initial receipts from suppliers, not for transfers between locations.",
  movementType: "initial_stock",
  requireFrom: false,
  requireTo: true,
  toFilter: (l) => l.is_source,
  defaultToCode: "FCRC",
  reasonOptions: [
    { value: "supplier_receipt", label: "Supplier receipt" },
    { value: "initial_load", label: "Initial catalog load" },
    { value: "recount", label: "Recount add" },
  ],
  submitLabel: "Record receipt",
};

export function ReceiveClient({ locations }: { locations: InventoryLocation[] }) {
  return <GuidedMovementWorkflow config={config} locations={locations} />;
}
