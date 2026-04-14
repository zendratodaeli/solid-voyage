import { CargoBoard } from "@/components/cargo-board/CargoBoard";

export const metadata = {
  title: "Cargo Board — Solid Voyage",
  description: "Track and manage cargo inquiries from receipt to fixture. Pipeline view for chartering operations.",
};

export default function CargoBoardPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Cargo Board</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Commercial cargo pipeline — track inquiries from broker to fixture
        </p>
      </div>
      <CargoBoard />
    </div>
  );
}
