import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import './Landing.css';

const Landing = () => {
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);

  const handleGetStarted = () => {
    setShowAuth(true);
  };

  if (showAuth) {
    navigate('/auth');
    return null;
  }

  return (
    <div className="landing-container">
      {/* Animated Background */}
      <div className="animated-bg">
        <div className="bubble bubble-1"></div>
        <div className="bubble bubble-2"></div>
        <div className="bubble bubble-3"></div>
        <div className="bubble bubble-4"></div>
        <div className="bubble bubble-5"></div>
      </div>

      {/* Hero Section */}
      <motion.div 
        className="hero-section"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        {/* Logo */}
        <motion.div 
          className="logo-container"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        >
          <div className="logo-icon">💬</div>
        </motion.div>

        {/* Title */}
        <motion.h1 
          className="hero-title"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          Welcome to <span className="gradient-text">ChatApp</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p 
          className="hero-subtitle"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          Connect with friends, share moments, and chat in real-time
        </motion.p>

        {/* Features */}
        <motion.div 
          className="features-grid"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Real-time Chat</h3>
            <p>Instant messaging with friends</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">👥</div>
            <h3>Group Chats</h3>
            <p>Create groups and chat together</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3>Secure</h3>
            <p>Your privacy is our priority</p>
          </div>
        </motion.div>

        {/* CTA Buttons */}
        <motion.div 
          className="cta-buttons"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          <button 
            className="cta-btn primary"
            onClick={handleGetStarted}
          >
            Get Started
            <span className="btn-arrow">→</span>
          </button>
          <button 
            className="cta-btn secondary"
            onClick={() => navigate('/auth')}
          >
            Sign In
          </button>
        </motion.div>

        {/* Floating Elements */}
        <motion.div 
          className="floating-emoji emoji-1"
          animate={{ 
            y: [0, -20, 0],
            rotate: [0, 10, 0]
          }}
          transition={{ 
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          💬
        </motion.div>
        <motion.div 
          className="floating-emoji emoji-2"
          animate={{ 
            y: [0, -30, 0],
            rotate: [0, -10, 0]
          }}
          transition={{ 
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5
          }}
        >
          🚀
        </motion.div>
        <motion.div 
          className="floating-emoji emoji-3"
          animate={{ 
            y: [0, -25, 0],
            rotate: [0, 15, 0]
          }}
          transition={{ 
            duration: 3.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          }}
        >
          ✨
        </motion.div>
      </motion.div>

      {/* Footer */}
      <motion.footer 
        className="landing-footer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2 }}
      >
        <p>Made with ❤️ by ChatApp Team</p>
      </motion.footer>
    </div>
  );
};

export default Landing;
