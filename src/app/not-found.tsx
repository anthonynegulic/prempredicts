import Link from "next/link";
import { Banner } from "@/components/Banner";

export default function NotFound() {
  return (
    <main id="main">
      <Banner pattern="flat" tight={false} showLabel={false}>
        <div className="eyebrow">Nothing here</div>
        <h1>
          Wrong<span className="stroke">Link</span>
        </h1>
      </Banner>
      <div className="wrap block">
        <div className="note">
          <b>That link doesn&apos;t work</b>
          <br />
          Either it was mistyped or it has been replaced. Ask the admin for a new
          one — regenerating a link kills the old one on purpose.
          <br />
          <br />
          <Link href="/">Back to the front</Link>
        </div>
      </div>
    </main>
  );
}
