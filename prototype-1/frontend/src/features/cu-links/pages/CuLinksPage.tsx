import { ServiceLinkCard } from "../components/ServiceLinkCard";
import { CU_LINKS } from "../data/cuLinks";

export function CuLinksPage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-6 py-8 md:px-16 xl:px-32">
        <header className="flex flex-col gap-2">
          <h1 className="font-body text-header-sm-emphasize text-grey-900">
            CU Links
          </h1>
          <p className="font-body text-body-md text-grey-700">
            รวมบริการและระบบที่เกี่ยวข้องสำหรับนิสิต Chula
          </p>
        </header>

        <section aria-label="CU Links" className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {CU_LINKS.map((item) => (
            <ServiceLinkCard key={item.id} item={item} />
          ))}
        </section>
      </div>
    </div>
  );
}
