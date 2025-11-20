import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  image: string;
  description: JSX.Element;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Built for Accuracy',
    image: require('@site/static/img/accuracy.png').default,
    description: (
      <>
        Bitredict rewards accurate predictions, not popularity. Our unique contrarian pool structure 
        incentivizes thorough analysis and valuable insights.
      </>
    ),
  },
  {
    title: 'Powered by Somnia',
    image: require('@site/static/img/somnia.png').default,
    description: (
      <>
        Built on Somnia's high-performance EVM network with 400,000+ TPS and sub-second finality. 
        Create and settle predictions instantly with minimal fees.
      </>
    ),
  },
  {
    title: 'Community Driven',
    image: require('@site/static/img/community.png').default,
    description: (
      <>
        Join a growing community of predictors, market makers, and liquidity providers. 
        Shape the future of decentralized prediction markets.
      </>
    ),
  },
];

function Feature({title, image, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <img className={styles.featureImg} src={image} alt={title} />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): JSX.Element {
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
