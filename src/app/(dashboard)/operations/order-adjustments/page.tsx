import { permanentRedirect } from "next/navigation";

export default function OrderAdjustmentsLegacyRedirect() {
  permanentRedirect("/customer-service/order-adjustments");
}
