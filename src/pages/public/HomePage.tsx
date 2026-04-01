import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, Users, Award, Shield, CheckCircle, Zap, Target } from 'lucide-react';
import { ROUTES } from '@/config/routes';
import { Button } from '@/components/ui/Button';

export function HomePage() {
  const features = [
    { icon: <Briefcase size={24} />, title: 'Smart Job Matching', desc: 'AI-powered ATS screens resumes against job requirements for perfect matches.' },
    { icon: <Award size={24} />, title: 'Adaptive Assessments', desc: 'Aptitude and coding assessments with AI-generated questions tailored to each role.' },
    { icon: <Users size={24} />, title: 'AI Interviews', desc: 'Automated interview system with speech recognition and real-time evaluation.' },
    { icon: <Shield size={24} />, title: 'Proctored Exams', desc: 'Face detection, fullscreen enforcement, and tab monitoring for exam integrity.' },
  ];

  const stats = [
    { value: '10,000+', label: 'Candidates Placed' },
    { value: '500+', label: 'Partner Companies' },
    { value: '95%', label: 'Satisfaction Rate' },
    { value: '24/7', label: 'AI-Powered Support' },
  ];

  const steps = [
    { num: '01', title: 'Create Profile', desc: 'Sign up and build your professional profile in minutes.' },
    { num: '02', title: 'AI Screening', desc: 'Our AI matches your skills with the best opportunities.' },
    { num: '03', title: 'Assessment', desc: 'Take adaptive aptitude and coding assessments.' },
    { num: '04', title: 'Get Hired', desc: 'Ace your AI interview and land your dream role.' },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Navbar */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-[var(--navbarBg)]/80 backdrop-blur-md border-b border-[var(--navbarBorder)] z-30">
        <div className="h-full px-6 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm gradient-brand shadow-sm">
              RP
            </div>
            <span className="font-bold text-lg font-heading gradient-text">RightPath</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to={ROUTES.PUBLIC.ABOUT} className="text-sm text-[var(--textSecondary)] hover:text-[var(--text)] transition-colors hidden sm:block">
              About
            </Link>
            <Link to={ROUTES.PUBLIC.CONTACT} className="text-sm text-[var(--textSecondary)] hover:text-[var(--text)] transition-colors hidden sm:block">
              Contact
            </Link>
            <Link to={ROUTES.PUBLIC.LOGIN}>
              <Button variant="outline" size="sm">Login</Button>
            </Link>
            <Link to={ROUTES.PUBLIC.REGISTER}>
              <Button variant="primary" size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.3), transparent 60%), radial-gradient(circle at 80% 80%, rgba(6, 182, 212, 0.2), transparent 50%)' }} />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--primaryLight)] text-[var(--primary)] text-sm font-medium mb-6 animate-fade-in-down">
            <Zap size={14} />
            AI-Powered Recruitment Platform
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-[var(--text)] mb-6 leading-tight font-heading animate-fade-in-up">
            Find the <span className="gradient-text">Right Path</span><br />to Your Career
          </h1>
          <p className="text-xl text-[var(--textSecondary)] mb-10 max-w-2xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            Connecting top talent with the right opportunities through intelligent assessments, AI-driven interviews, and smart matching.
          </p>
          <div className="flex items-center justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
            <Link to={ROUTES.PUBLIC.REGISTER}>
              <Button variant="primary" size="lg" rightIcon={<ArrowRight size={18} />}>
                Start Your Journey
              </Button>
            </Link>
            <Link to={ROUTES.PUBLIC.ABOUT}>
              <Button variant="outline" size="lg">Learn More</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="py-12 px-6 bg-[var(--surface1)] border-y border-[var(--border)]">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <div key={stat.label} className="text-center animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <p className="text-3xl font-bold gradient-text font-heading">{stat.value}</p>
              <p className="text-sm text-[var(--textSecondary)] mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-[var(--text)] font-heading mb-3">Why RightPath?</h2>
            <p className="text-[var(--textSecondary)] max-w-xl mx-auto">Everything you need for a modern, fair, and efficient hiring process.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="bg-[var(--cardBg)] border border-[var(--cardBorder)] rounded-xl p-6 text-center shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 animate-fade-in-up"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="w-14 h-14 rounded-xl gradient-brand flex items-center justify-center text-white mx-auto mb-4 shadow-sm">
                  {feature.icon}
                </div>
                <h3 className="font-semibold text-[var(--text)] mb-2 font-heading">{feature.title}</h3>
                <p className="text-sm text-[var(--textSecondary)]">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-[var(--surface1)]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-[var(--text)] font-heading mb-3">How It Works</h2>
            <p className="text-[var(--textSecondary)]">Four simple steps to your dream career</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {steps.map((stepItem, i) => (
              <div key={stepItem.num} className="relative animate-fade-in-up" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="text-5xl font-bold text-[var(--primary)]/10 font-heading mb-2">{stepItem.num}</div>
                <h3 className="text-lg font-semibold text-[var(--text)] font-heading mb-2">{stepItem.title}</h3>
                <p className="text-sm text-[var(--textSecondary)]">{stepItem.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="rounded-2xl p-12 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
            <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.3), transparent 60%)' }} />
            <div className="relative z-10">
              <h2 className="text-3xl font-bold text-white font-heading mb-4">Ready to Find Your Right Path?</h2>
              <p className="text-slate-400 mb-8 max-w-lg mx-auto">
                Join thousands of candidates and companies already using RightPath for smarter hiring.
              </p>
              <Link to={ROUTES.PUBLIC.REGISTER}>
                <Button variant="primary" size="lg" rightIcon={<ArrowRight size={18} />}>
                  Get Started Free
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs gradient-brand">
              RP
            </div>
            <p className="text-sm text-[var(--textTertiary)]">&copy; 2025 RightPath. All rights reserved.</p>
          </div>
          <div className="flex gap-6">
            <Link to={ROUTES.PUBLIC.ABOUT} className="text-sm text-[var(--textTertiary)] hover:text-[var(--text)] transition-colors">About</Link>
            <Link to={ROUTES.PUBLIC.CONTACT} className="text-sm text-[var(--textTertiary)] hover:text-[var(--text)] transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
