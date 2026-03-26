// Server component — forces dynamic rendering so Privy never prebuilds
export const dynamic = "force-dynamic";

import NexusDashboard from "@/components/terminal/NexusDashboard";

export default function Page() {
  return <NexusDashboard />;
}
