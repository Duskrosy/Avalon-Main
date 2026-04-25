"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Truck } from "lucide-react";
import type { DrawerCompletion, DrawerHandoff } from "./types";

type Props = {
  handoff: DrawerHandoff;
  completion: DrawerCompletion;
  onSetHandoff: (patch: Partial<DrawerHandoff>) => void;
  onSetCompletion: (patch: Partial<DrawerCompletion>) => void;
};

const PIC_OPTIONS = ["Fulfillment", "Inventory", "Customer Service", "Lalamove"];
const MOP_OPTIONS = ["COD", "GCash", "BPI", "Bank Transfer", "Other"];

export function StepHandoff({
  handoff,
  completion,
  onSetHandoff,
  onSetCompletion,
}: Props) {
  const [showCompletion, setShowCompletion] = useState(false);

  const isLalamove = handoff.person_in_charge_label?.toLowerCase() === "lalamove";

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">
          Mode of Payment
        </label>
        <select
          value={handoff.mode_of_payment ?? ""}
          onChange={(e) => onSetHandoff({ mode_of_payment: e.target.value || null })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
        >
          <option value="">— Select —</option>
          {MOP_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">
          Person in Charge
        </label>
        <select
          value={handoff.person_in_charge_label ?? ""}
          onChange={(e) => {
            const val = e.target.value || null;
            onSetHandoff({
              person_in_charge_label: val,
              person_in_charge_type:
                val?.toLowerCase() === "lalamove"
                  ? "lalamove"
                  : val
                    ? "custom"
                    : null,
            });
          }}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
        >
          <option value="">— Select —</option>
          {PIC_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {isLalamove && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
            <Truck size={11} /> Will route to TNVS Orders
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-gray-700 block mb-1">
          Notes (optional)
        </label>
        <textarea
          value={handoff.notes ?? ""}
          onChange={(e) => onSetHandoff({ notes: e.target.value || null })}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md min-h-[60px]"
          placeholder="Any handoff details for ops…"
        />
      </div>

      <div className="border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => setShowCompletion((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          {showCompletion ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Add attribution details (optional, fill now or later)
        </button>
        {showCompletion && (
          <div className="mt-3 space-y-3 bg-gray-50 border border-gray-200 rounded-md p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-700 block mb-1">Net value (₱)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={completion.net_value_amount ?? ""}
                  onChange={(e) =>
                    onSetCompletion({
                      net_value_amount: e.target.value
                        ? parseFloat(e.target.value)
                        : null,
                    })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded"
                />
              </div>
              <div>
                <label className="text-xs text-gray-700 block mb-1">Ad campaign</label>
                <input
                  type="text"
                  value={completion.ad_campaign_source ?? ""}
                  onChange={(e) =>
                    onSetCompletion({ ad_campaign_source: e.target.value || null })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!!completion.is_abandoned_cart}
                  onChange={(e) =>
                    onSetCompletion({ is_abandoned_cart: e.target.checked })
                  }
                />
                Abandoned cart
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={!!completion.alex_ai_assist}
                  onChange={(e) =>
                    onSetCompletion({ alex_ai_assist: e.target.checked })
                  }
                />
                Alex AI assist
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
