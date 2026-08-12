import type {ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/getting-started">
            Get Started in 5 Minutes
          </Link>
          <Link
            className="button button--outline button--lg"
            style={{marginLeft: '1rem', color: 'white', borderColor: 'white'}}
            href="https://github.com/agenticops/opspilot">
            View on GitHub
          </Link>
        </div>
      </div>
    </header>
  );
}

type FeatureItem = {
  title: string;
  emoji: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: '5-Minute Setup',
    emoji: '🚀',
    description: (
      <>
        Interactive wizard gets you running fast. Auto-detects your tools,
        configures channels, and you're ready to go.
      </>
    ),
  },
  {
    title: 'Multi-Channel',
    emoji: '💬',
    description: (
      <>
        Talk to OpsPilot via Telegram, Slack, or web chat. Get notifications
        and alerts wherever you are.
      </>
    ),
  },
  {
    title: 'Persistent Memory',
    emoji: '🧠',
    description: (
      <>
        It remembers how you fixed issues 6 months ago. Hybrid vector + keyword
        search finds relevant context instantly.
      </>
    ),
  },
  {
    title: 'DevOps Skills',
    emoji: '🛠️',
    description: (
      <>
        Pre-built skills for Kubernetes debugging, incident response, Prometheus
        queries, log analysis, and more.
      </>
    ),
  },
  {
    title: 'Proactive Automation',
    emoji: '⚡',
    description: (
      <>
        Morning briefings, heartbeat checks, and scheduled tasks. OpsPilot
        works for you even when you're not watching.
      </>
    ),
  },
  {
    title: 'Local-First',
    emoji: '🔒',
    description: (
      <>
        Runs on YOUR machine. Your data stays yours. Open source, MIT licensed,
        fully customizable.
      </>
    ),
  },
];

function Feature({title, emoji, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md" style={{marginBottom: '2rem'}}>
        <div style={{fontSize: '3rem', marginBottom: '1rem'}}>{emoji}</div>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}

function QuickExample(): ReactNode {
  return (
    <section style={{padding: '4rem 0', background: 'var(--ifm-background-surface-color)'}}>
      <div className="container">
        <div className="row">
          <div className="col col--6">
            <Heading as="h2">See It In Action</Heading>
            <p style={{fontSize: '1.1rem', marginBottom: '1.5rem'}}>
              Ask OpsPilot anything about your infrastructure. It understands context,
              remembers past solutions, and takes action.
            </p>
            <Link
              className="button button--primary button--lg"
              to="/getting-started">
              Try It Now
            </Link>
          </div>
          <div className="col col--6">
            <div style={{
              background: '#1e293b',
              borderRadius: '8px',
              padding: '1.5rem',
              fontFamily: 'var(--ifm-font-family-monospace)',
              fontSize: '0.9rem',
              color: '#e2e8f0'
            }}>
              <div style={{color: '#94a3b8', marginBottom: '0.5rem'}}>You:</div>
              <div style={{marginBottom: '1rem'}}>Why is the api-service pod crashing?</div>

              <div style={{color: '#94a3b8', marginBottom: '0.5rem'}}>OpsPilot:</div>
              <div>
                The pod is in CrashLoopBackOff due to OOMKilled.
                <br /><br />
                <span style={{color: '#38bdf8'}}>Current limit:</span> 512Mi
                <br />
                <span style={{color: '#38bdf8'}}>Usage at crash:</span> 498Mi
                <br /><br />
                Recommended: Increase memory limit to 1Gi.
                <br /><br />
                <span style={{color: '#4ade80'}}>Want me to apply this fix?</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title="Your 24/7 DevOps Copilot"
      description="OpsPilot is a personal AI agent that runs on your infrastructure and helps you manage DevOps tasks through natural conversation.">
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <QuickExample />
      </main>
    </Layout>
  );
}
