import Link from 'next/link';

const features = [
  '将复杂 PDF 文档解析为 Markdown',
  '对 PDF 文档进行精准保留排版的翻译',
  '根据用户提供的文档一键生成 PPT',
];

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col px-4 py-20 md:py-28">
      <section className="text-center">
        <p className="mb-4 text-sm tracking-[0.24em] text-content-secondary">公司名称</p>
        <h1 className="text-3xl font-semibold tracking-tight text-content-primary md:text-5xl">
          北京智通明识科技有限公司
        </h1>
      </section>

      <section className="mt-20">
        <h2 className="text-2xl font-semibold text-content-primary md:text-3xl">公司其他产品介绍</h2>
        <p className="mt-6 text-base leading-8 text-content-secondary md:text-lg md:leading-9">
          我们的产品 知译 Zpdf（
          <Link
            href="https://www.zhiyipdf.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent underline decoration-accent/35 underline-offset-4 hover:text-accent-hover"
          >
            www.zhiyipdf.com
          </Link>
          ）是一个基于大语言模型的多功能智能文档平台，提供以下功能：
        </p>
        <ul className="mt-8 space-y-4 text-base leading-8 text-content-primary md:text-lg">
          {features.map((feature) => (
            <li key={feature} className="border-b border-border/70 pb-4 last:border-b-0">
              {feature}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-20 border-t border-border pt-8">
        <h2 className="text-2xl font-semibold text-content-primary md:text-3xl">
          Zpdf——Choose 开源声明
        </h2>
        <p className="mt-6 text-lg font-medium text-content-primary">禁止商业用途与倒卖。</p>
      </section>
    </div>
  );
}
