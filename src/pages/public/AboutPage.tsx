import { Link } from 'react-router-dom';
import { ArrowLeft, Target, Users, Award, Shield, Lightbulb } from 'lucide-react';
import { ROUTES } from '@/config/routes';

export function AboutPage() {
  const values = [
    { icon: <Target size={24} />, title: 'Precision', desc: 'AI-driven matching ensures the right fit every time.' },
    { icon: <Users size={24} />, title: 'Fairness', desc: 'Reducing bias through standardized, automated evaluations.' },
    { icon: <Lightbulb size={24} />, title: 'Innovation', desc: 'Cutting-edge technology for a modern hiring experience.' },
    { icon: <Shield size={24} />, title: 'Integrity', desc: 'Proctored environments and secure data handling.' },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="fixed top-0 left-0 right-0 h-16 bg-[var(--navbarBg)]/80 backdrop-blur-md border-b border-[var(--navbarBorder)] z-30">
        <div className="h-full px-6 flex items-center justify-between max-w-7xl mx-auto">
          <Link to={ROUTES.PUBLIC.HOME} className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm gradient-brand shadow-sm">RP</div>
            <span className="font-bold text-lg font-heading gradient-text">RightPath</span>
          </Link>
        </div>
      </header>

      <main className="pt-24 pb-16 px-6 max-w-4xl mx-auto animate-fade-in-up">
        <Link to={ROUTES.PUBLIC.HOME} className="inline-flex items-center gap-2 text-sm text-[var(--textSecondary)] hover:text-[var(--text)] mb-8 transition-colors">
          <ArrowLeft size={16} /> Back to Home
        </Link>

        {/* Hero section */}
        <div className="mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-[var(--text)] mb-6 font-heading">
            About <span className="gradient-text">RightPath</span>
          </h1>
          <p className="text-lg text-[var(--textSecondary)] max-w-2xl leading-relaxed">
            RightPath is an AI-powered recruitment platform designed to streamline the hiring process for both employers and candidates. Our platform leverages cutting-edge technology to create fair, efficient, and intelligent hiring workflows.
          </p>
        </div>

        {/* Mission */}
        <div className="bg-[var(--cardBg)] border border-[var(--cardBorder)] rounded-xl p-8 shadow-card mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl gradient-brand flex items-center justify-center text-white shadow-sm">
              <Target size={20} />
            </div>
            <h2 className="text-2xl font-semibold text-[var(--text)] font-heading">Our Mission</h2>
          </div>
          <p className="text-[var(--textSecondary)] leading-relaxed">
            To connect the right talent with the right opportunities through intelligent automation, reducing bias and improving hiring outcomes for everyone involved.
          </p>
        </div>

        {/* What we offer */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-[var(--text)] font-heading mb-6">What We Offer</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              'AI-powered resume screening and ATS matching',
              'Automated aptitude and coding assessments',
              'AI-driven interview system with voice interaction',
              'Proctored exam environment with face detection',
              'Comprehensive candidate tracking and analytics',
              'Role-based access and pipeline management',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 p-4 rounded-xl bg-[var(--surface1)] border border-[var(--border)]">
                <div className="w-6 h-6 rounded-full bg-[var(--successLight)] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Award size={12} className="text-[var(--success)]" />
                </div>
                <span className="text-[var(--text)] text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Values */}
        <div>
          <h2 className="text-2xl font-semibold text-[var(--text)] font-heading mb-6">Our Values</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {values.map((v, i) => (
              <div
                key={v.title}
                className="bg-[var(--cardBg)] border border-[var(--cardBorder)] rounded-xl p-6 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl gradient-brand flex items-center justify-center text-white mb-4 shadow-sm">
                  {v.icon}
                </div>
                <h3 className="font-semibold text-[var(--text)] mb-2 font-heading">{v.title}</h3>
                <p className="text-sm text-[var(--textSecondary)]">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
