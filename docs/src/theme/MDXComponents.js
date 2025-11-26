import React from 'react';
import MDXComponents from '@theme-original/MDXComponents';

const GradientText = ({children, ...props}) => (
  <span
    style={{
      background: 'linear-gradient(135deg, #22C7FF 0%, #FF0080 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      ...props.style,
    }}
    {...props}
  >
    {children}
  </span>
);

const Card = ({children, ...props}) => (
  <div
    style={{
      padding: '1.5rem',
      height: '100%',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.03)',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(8px)',
      transition: 'all 0.3s ease',
      ...props.style,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.4)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'none';
      e.currentTarget.style.boxShadow = 'none';
    }}
    {...props}
  >
    {children}
  </div>
);

const Hero = ({children, ...props}) => (
  <div
    style={{
      padding: '4rem 2rem',
      marginBottom: '2rem',
      borderRadius: '16px',
      background: 'radial-gradient(circle at top left, rgba(12, 12, 35, 0.8), rgba(0, 0, 21, 0.8))',
      border: '1px solid rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(8px)',
      textAlign: 'center',
      ...props.style,
    }}
    {...props}
  >
    {children}
  </div>
);

const Button = ({children, primary, ...props}) => (
  <a
    style={{
      display: 'inline-block',
      padding: '0.75rem 1.5rem',
      borderRadius: '8px',
      background: primary
        ? 'linear-gradient(135deg, #22C7FF 0%, #007BFF 100%)'
        : 'linear-gradient(135deg, #FF0080 0%, #8C00FF 100%)',
      color: 'white',
      textDecoration: 'none',
      fontWeight: 500,
      transition: 'all 0.3s ease',
      border: 'none',
      ...props.style,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-1px)';
      e.currentTarget.style.boxShadow = '0 4px 16px rgba(34, 199, 255, 0.3)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'none';
      e.currentTarget.style.boxShadow = 'none';
    }}
    {...props}
  >
    {children}
  </a>
);

export default {
  ...MDXComponents,
  GradientText,
  Card,
  Hero,
  Button,
}; 