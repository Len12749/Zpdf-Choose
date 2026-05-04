'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, ArrowDown, Shuffle, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { QuestionBankRow } from '@/types/database';

type OrderType = 'asc' | 'desc' | 'random';

const orderOptions: { value: OrderType; label: string; icon: React.ReactNode }[] = [
  { value: 'asc', label: '顺序', icon: <ArrowUp className="w-4 h-4" /> },
  { value: 'desc', label: '逆序', icon: <ArrowDown className="w-4 h-4" /> },
  { value: 'random', label: '乱序', icon: <Shuffle className="w-4 h-4" /> },
];

export default function StudyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [banks, setBanks] = useState<(QuestionBankRow & { question_count: number })[]>([]);
  const [selectedBank, setSelectedBank] = useState<number | null>(null);
  const [order, setOrder] = useState<OrderType>('asc');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/question-bank')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setBanks(data.data.filter((b: QuestionBankRow & { question_count: number }) => b.question_count > 0));
      })
      .catch(() => toast('加载题库失败', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleStart = () => {
    if (!selectedBank) {
      toast('请选择题库', 'error');
      return;
    }
    router.push(`/study/${selectedBank}?order=${order}`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-10">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <GraduationCap className="w-8 h-8 text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-content-primary mb-2">背题模式</h1>
        <p className="text-content-secondary">直接查看答案和解析，移动端可左右滑动切题</p>
      </div>

      <div className="space-y-6">
        <div>
          <h2 className="text-sm font-medium text-content-secondary mb-3">选择题库</h2>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-surface-secondary rounded-xl animate-pulse" />)}
            </div>
          ) : banks.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-content-secondary">暂无包含题目的题库</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {banks.map((bank) => (
                <Card
                  key={bank.id}
                  clickable
                  className={selectedBank === bank.id ? 'border-accent bg-accent/5' : ''}
                  onClick={() => setSelectedBank(bank.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-content-primary">{bank.name}</p>
                      {bank.description && (
                        <p className="text-sm text-content-secondary mt-0.5 line-clamp-1">{bank.description}</p>
                      )}
                    </div>
                    <Badge>{bank.question_count} 题</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-medium text-content-secondary mb-3">浏览顺序</h2>
          <div className="grid grid-cols-3 gap-3">
            {orderOptions.map(({ value, label, icon }) => (
              <button
                key={value}
                onClick={() => setOrder(value)}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border transition-all cursor-pointer ${
                  order === value
                    ? 'border-accent bg-accent/5 text-accent'
                    : 'border-border text-content-secondary hover:border-accent/30'
                }`}
              >
                {icon}
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <Button onClick={handleStart} className="w-full" size="lg" disabled={!selectedBank}>
          开始背题
        </Button>
      </div>
    </div>
  );
}
