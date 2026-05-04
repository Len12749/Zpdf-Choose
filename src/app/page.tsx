import Link from 'next/link';
import { BookOpen, Brain, GraduationCap, Star, AlertCircle, Info } from 'lucide-react';

const features = [
  {
    href: '/question-bank',
    icon: BookOpen,
    title: '题库管理',
    description: '创建题库，上传PDF、文本或图片，AI自动识别选择题',
  },
  {
    href: '/quiz',
    icon: Brain,
    title: '开始练习',
    description: '选择题库进行刷题，支持顺序、逆序和乱序模式',
  },
  {
    href: '/study',
    icon: GraduationCap,
    title: '背题模式',
    description: '直接查看题干、答案和解析，移动端可左右滑动切题',
  },
  {
    href: '/favorites',
    icon: Star,
    title: '我的收藏',
    description: '收藏重要题目，随时回顾复习',
  },
  {
    href: '/wrong-answers',
    icon: AlertCircle,
    title: '错题本',
    description: '自动记录错题，标注错误次数，针对性练习',
  },
  {
    href: '/about',
    icon: Info,
    title: '关于我们',
    description: '了解开源声明、公司信息与知译 Zpdf 产品介绍',
  },
];

export default function Home() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-content-primary mb-4">
          <span className="text-accent">Zpdf-Choose</span>
        </h1>
        <p className="text-lg text-content-secondary max-w-2xl mx-auto">
          上传PDF、文本或图片，AI智能识别选择题，打造专属题库，高效刷题备考
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="group bg-surface-secondary border border-border rounded-2xl p-6 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5 transition-all duration-300 active:scale-[0.98]"
          >
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
              <Icon className="w-6 h-6 text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-content-primary mb-2">{title}</h2>
            <p className="text-sm text-content-secondary leading-relaxed">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
