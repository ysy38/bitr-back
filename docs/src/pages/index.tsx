import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/intro">
            Get Started with Bitredict 🚀
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={`Welcome to ${siteConfig.title}`}
      description="Decentralized Prediction Markets on Somnia Network">
      <HomepageHeader />
      <main>
        <div className="container" style={{ padding: '2rem 0' }}>
          <div className="row">
            <div className="col col--4">
              <div className="text--center">
                <h3>🎯 P2P Markets</h3>
                <p>
                  Create and trade on prediction markets with complete decentralization.
                  No intermediaries, just pure peer-to-peer action.
                </p>
              </div>
            </div>
            <div className="col col--4">
              <div className="text--center">
                <h3>🔮 Dual Oracles</h3>
                <p>
                  Choose between guided markets with API automation or open markets
                  with community consensus.
                </p>
              </div>
            </div>
            <div className="col col--4">
              <div className="text--center">
                <h3>🏆 Reputation System</h3>
                <p>
                  Build your reputation through successful predictions and unlock
                  enhanced privileges.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </Layout>
  );
}
