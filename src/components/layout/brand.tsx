import Image from "next/image";
import Link from "next/link";

export function Brand({ size = 40, light = false }: { size?: number; light?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3" aria-label="Lava Jato Capuã — início">
      <Image src="/branding/logo-ljc.png" alt="" width={size} height={Math.round(size * 0.92)} priority />
      <span className={`text-lg font-extrabold leading-none ${light ? "text-white" : "text-navy-950"}`}>
        LJC <span className="font-medium opacity-80">System</span>
      </span>
    </Link>
  );
}
