/*
  Full refactor of the Days Clean site script (translated to English).
  Main objective: reduce chat size (limit displayed messages)
  + performance and organization improvements (event delegation, cache, debounce/throttle, observers).

  Note: Preserved original behavior, only changed chat logic to keep
  the last messages (maxMessages) and prevent the container from growing indefinitely.
*/

/* =========================
   Utilities
   ========================= */
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

// Debounce and throttle helpers
const debounce = (fn, ms = 10) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
};

const rafThrottle = (fn) => {
  let ticking = false;
  return (...args) => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      fn(...args);
      ticking = false;
    });
  };
};

/* =========================
   Menu (show/hide + close on link click)
   ========================= */
(function menuControls() {
  const navMenu = $('#nav-menu');
  const navToggle = $('#nav-toggle');
  const navClose = $('#nav-close');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => navMenu.classList.add('show-menu'));
  }
  if (navClose && navMenu) {
    navClose.addEventListener('click', () => navMenu.classList.remove('show-menu'));
  }

  // close mobile menu with delegation
  document.addEventListener('click', (e) => {
    const target = e.target.closest('.nav__link');
    if (target && navMenu) navMenu.classList.remove('show-menu');
  });
})();

/* =========================
   Scroll header / scroll-up / active link
   Combined scroll handler for performance
   ========================= */
(function scrollHandlers() {
  const header = $('#header');
  const scrollUpEl = $('#scroll-up');
  const sections = $$('section[id]');
  const navMenu = $('.nav__menu');

  function onScroll() {
    const y = window.scrollY || window.pageYOffset;

    // header background
    if (header) {
      header.classList.toggle('scroll-header', y >= 80);
    }

    // show scroll up
    if (scrollUpEl) {
      scrollUpEl.classList.toggle('show-scroll', y >= 560);
    }

    // active link
    if (sections.length && navMenu) {
      for (const sec of sections) {
        const top = sec.offsetTop - 50;
        const height = sec.offsetHeight;
        const id = sec.id;
        const link = navMenu.querySelector(`a[href*="#${id}"]`);
        if (!link) continue;
        const active = y > top && y <= top + height;
        link.classList.toggle('active-link', active);
      }
    }
  }

  window.addEventListener('scroll', rafThrottle(onScroll));
  document.addEventListener('DOMContentLoaded', onScroll);
})();

/* =========================
   Smooth scrolling (respect header height)
   ========================= */
(function smoothScroll() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href === '#') return;

    const target = document.querySelector(href);
    if (!target) return;

    e.preventDefault();
    const header = document.querySelector('.header');
    const headerHeight = header ? header.offsetHeight : 0;
    const top = target.offsetTop - headerHeight;

    window.scrollTo({ top, behavior: 'smooth' });
  });
})();

/* =========================
   Gallery tabs (simple delegation)
   ========================= */
(function galleryTabs() {
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.gallery__tab');
    if (!tab) return;
    const parent = tab.closest('.gallery');
    if (!parent) return;

    const tabId = tab.dataset.tab;
    const allTabs = parent.querySelectorAll('.gallery__tab');
    const allContents = parent.querySelectorAll('.gallery__tab-content');

    allTabs.forEach(t => t.classList.remove('active'));
    allContents.forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
  });
})();

/* =========================
   Contact form
   ========================= */
(function contactForm() {
  const form = $('#contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = (fd.get('name') || '').trim();
    const email = (fd.get('email') || '').trim();
    const phone = (fd.get('phone') || '').trim();
    const service = (fd.get('service') || '').trim();
    const message = (fd.get('message') || '').trim();

    if (!name || !email || !phone || !service || !message) {
      showNotification('Please fill in all fields.', 'error');
      return;
    }

    showNotification('Message sent successfully! We will contact you soon.', 'success');
    form.reset();
  });
})();

/* =========================
   Notification system
   ========================= */
(function notifications() {
  const containerId = 'site-notifications-container';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    container.style.position = 'fixed';
    container.style.top = '2rem';
    container.style.right = '2rem';
    container.style.zIndex = '1000';
    container.style.maxWidth = '400px';
    document.body.appendChild(container);
  }

  window.showNotification = (message, type = 'info') => {
    const note = document.createElement('div');
    note.className = `notification notification--${type}`;
    note.innerHTML = `
      <div class="notification__content">
        <span class="notification__icon" aria-hidden="true"></span>
        <div class="notification__text">${message}</div>
      </div>
      <button class="notification__close" aria-label="Close">&times;</button>
    `;

    container.prepend(note);
    requestAnimationFrame(() => note.classList.add('notification--show'));

    const autoRemove = setTimeout(() => removeNote(note), 5000);

    note.querySelector('.notification__close').addEventListener('click', () => {
      clearTimeout(autoRemove);
      removeNote(note);
    });

    function removeNote(el) {
      el.classList.remove('notification--show');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }
  };
})();

/* =========================
   ChatAssistant (refactored)
   ========================= */
class ChatAssistant {
  constructor(options = {}) {
    this.chatWindow = $('#chat-window');
    this.chatMessages = $('#chat-messages');
    this.chatInput = $('#chat-input');
    this.chatSend = $('#chat-send');
    this.chatClose = $('#chat-close');
    this.chatAssistantBtn = $('#chat-assistant-btn');
    this.chatCTA = $('#chat-cta');
    this.quickContainer = $('#chat-quick-replies');
    this.chatNotification = $('#chat-notification');

    this.isOpen = false;
    this.maxMessages = options.maxMessages || 40;
    this.typingId = 'chat-typing-indicator';

    this.responses = options.responses || {
      'available services': 'We offer the following services:\n\n🏠 Residential Cleaning\n🏢 Commercial Cleaning\n\n🔨 Post-Construction Cleaning\n⚡ Cleaning glass doors\n\nWhich service would you like to know more about?',
      'request quote': 'Great! To request a personalized quote, I need some information:\n\n📋 Type of service\n📍 Location\n📏 Size of the space\n📅 Desired frequency',
      'working hours': 'Mon-Fri: 8am-6pm\nSat: 8am-12pm\nSun: Closed\n',
      'talk to agent': 'I’ll connect you with one of our agents!\n📞 +1 (954) 695-0198\n📧 DAYSCLEANINGSOLUTIONS@GMAIL.COM',
      'location': 'Deerfield Beach - FL, USA',
      'emergency': 'For emergencies, call: +1 (954) 695-0198',
      'prices': 'Prices are customized according to service type, size, frequency, and location.',
      'products': 'We use eco-friendly and certified products, safe for children and pets.'
    };

    this.dateFormatter = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' });

    this.init();
  }

  init() {
    if (this.chatAssistantBtn) this.chatAssistantBtn.addEventListener('click', () => this.toggleChat());
    if (this.chatCTA) this.chatCTA.addEventListener('click', (e) => { e.preventDefault(); this.openChat(); });
    if (this.chatClose) this.chatClose.addEventListener('click', () => this.closeChat());

    if (this.chatSend) this.chatSend.addEventListener('click', () => this.sendMessage());
    if (this.chatInput) this.chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.sendMessage(); });

    document.addEventListener('click', (e) => {
      const qr = e.target.closest('.quick-reply');
      if (!qr) return;
      const msg = qr.datasetMessage || qr.dataset.message || qr.getAttribute('data-message');
      if (msg) {
        this.sendUserMessage(msg);
        this.processMessage(msg);
      }
    });

    setTimeout(() => this.showNotification(), 3000);
  }

  trimMessages() {
    if (!this.chatMessages) return;
    while (this.chatMessages.children.length > this.maxMessages) {
      this.chatMessages.removeChild(this.chatMessages.firstElementChild);
    }
  }

  toggleChat() {
    this.isOpen ? this.closeChat() : this.openChat();
  }

  openChat() {
    if (this.chatWindow) this.chatWindow.classList.add('active');
    this.isOpen = true;
    if (this.chatNotification) this.chatNotification.style.display = 'none';
    if (this.chatInput) this.chatInput.focus();
  }

  closeChat() {
    if (this.chatWindow) this.chatWindow.classList.remove('active');
    this.isOpen = false;
  }

  showNotification() {
    if (!this.isOpen && this.chatNotification) this.chatNotification.style.display = 'block';
  }

  sendMessage() {
    if (!this.chatInput) return;
    const message = this.chatInput.value.trim();
    if (!message) return;
    this.sendUserMessage(message);
    this.chatInput.value = '';
    this.processMessage(message);
  }

  sendUserMessage(message) {
    this.appendMessages([{ text: message, sender: 'user' }]);
  }

  sendAssistantMessage(message) {
    this.appendMessages([{ text: message, sender: 'assistant' }]);
  }

  appendMessages(messages) {
    if (!this.chatMessages) return;

    const frag = document.createDocumentFragment();
    for (const m of messages) {
      const el = document.createElement('div');
      el.className = `message ${m.sender}-message`;
      el.innerHTML = `
        <div class="message-content">
          <p>${this.escapeHtml(m.text).replace(/\n/g, '<br>')}</p>
          <span class="message-time">${this.dateFormatter.format(new Date())}</span>
        </div>`;
      frag.appendChild(el);
    }

    this.chatMessages.appendChild(frag);
    this.trimMessages();
    this.scrollToBottom();
  }

  escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (s) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[s]);
  }

  scrollToBottom() {
    if (!this.chatMessages) return;
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  showTypingIndicator() {
    if (!this.chatMessages) return;
    if (this.chatMessages.querySelector(`#${this.typingId}`)) return;
    const el = document.createElement('div');
    el.id = this.typingId;
    el.className = 'message assistant-message typing-message';
    el.innerHTML = `
      <div class="typing-indicator">
        <span>Typing</span>
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>`;
    this.chatMessages.appendChild(el);
    this.scrollToBottom();
  }

  hideTypingIndicator() {
    const el = this.chatMessages && this.chatMessages.querySelector(`#${this.typingId}`);
    if (el) el.remove();
  }

  processMessage(message) {
    this.showTypingIndicator();
    setTimeout(() => {
      this.hideTypingIndicator();
      const lower = message.toLowerCase();
      let resp = this.matchResponse(lower);
      if (!resp) {
        resp = 'Thank you for your message! To better assist you, you can:\n\n📞 Call: +1 (954) 695-0198\n📧 Email: DAYSCLEANINGSOLUTIONS@GMAIL.COM';
      }
      this.sendAssistantMessage(resp);
    }, 900);
  }

  matchResponse(message) {
    for (const key of Object.keys(this.responses)) {
      if (message.includes(key.toLowerCase())) return this.responses[key];
      const kws = key.split(' ');
      if (kws.some(k => k && message.includes(k))) return this.responses[key];
    }

    if (this.containsAny(message, ['hello', 'hi', 'good morning', 'good afternoon', 'good evening'])) {
      return 'Hello! Welcome to Days Clean! 😊\n\nHow can I help you today?';
    }
    if (this.containsAny(message, ['thanks', 'thank you'])) {
      return 'Glad to help! 😊';
    }
    return null;
  }

  containsAny(text, arr) {
    return arr.some(s => text.includes(s));
  }
}

/* =========================
   IntersectionObserver for animations & lazy images
   ========================= */
(function observers() {
  const animateSelector = '.service__card, .before-after__item, .portfolio__item, .contact__item';
  const animateElements = $$(animateSelector);
  if (animateElements.length) {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) entry.target.classList.add('animate-in');
      }
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    animateElements.forEach(el => observer.observe(el));
  }

  const lazyImages = $$('img[data-src]');
  if (lazyImages.length) {
    const imgObserver = new IntersectionObserver((entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target;
        img.src = img.dataset.src;
        img.addEventListener('load', () => img.classList.remove('lazy'));
        obs.unobserve(img);
      }
    });
    lazyImages.forEach(img => imgObserver.observe(img));
  }
})();

/* =========================
   Page init
   ========================= */
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.chatAssistant = new ChatAssistant({ maxMessages: 40 });
  } catch (err) {
    console.error('Failed to initialize chat assistant', err);
  }

  document.body.classList.add('loaded');

  const cards = $$('.service__card, .before-after__item, .portfolio__item');
  cards.forEach((c, i) => { c.style.animationDelay = `${i * 0.08}s`; });

  ['hero-image.jpg', 'about-image.jpg'].forEach(src => { const i = new Image(); i.src = src; });

  console.log('Days Clean refactor loaded');
});

/* =========================
   Service worker registration
   ========================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(() => console.log('ServiceWorker registered'))
      .catch(() => console.log('ServiceWorker registration failed'));
  });
}

/* =========================
   Export for testing
   ========================= */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChatAssistant };
}
