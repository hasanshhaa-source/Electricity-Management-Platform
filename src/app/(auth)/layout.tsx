import { Zap } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gradient-to-br from-blue-700 to-blue-900 p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold">ElectroManage</span>
        </div>

        <div>
          <h2 className="text-3xl font-bold leading-snug">
            Electricity bills management<br />made simple.
          </h2>
          <p className="mt-4 text-blue-200 leading-relaxed">
            Manage multiple buildings, track consumption, generate bills, and keep
            every tenant informed — all in one place.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              { value: 'Multi-building', label: 'support out of the box' },
              { value: 'Shared meters', label: 'with configurable splits' },
              { value: 'Audit trail', label: 'on every calculation' },
              { value: 'Role-based', label: 'access control' },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-white/10 p-4">
                <p className="text-sm font-semibold">{item.value}</p>
                <p className="text-xs text-blue-200">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-blue-300">© 2025 ElectroManage. All rights reserved.</p>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <div className="flex lg:hidden items-center gap-2 mb-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-gray-900">ElectroManage</span>
        </div>
        {children}
      </div>
    </div>
  );
}
