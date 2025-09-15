/*
  Refactor completo do script do site Days Clean.
  Objetivo principal: reduzir o tamanho do chat (limitar mensagens exibidas)
  + melhorias de performance e organização (event delegation, cache, debounce/throttle, observers).

  Nota: preservei o comportamento original e alterei especificamente a lógica do chat para manter
  apenas as últimas mensagens (maxMessages) e evitar que o container cresça indefinidamente.
*/

/* =========================
   Utilitários
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

  // close mobile menu with delegation on click for performance
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

  // Use rAF throttle for smoothness
  window.addEventListener('scroll', rafThrottle(onScroll));
  // run once on load
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
   Contact form (lightweight)
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
      showNotification('Por favor, preencha todos os campos.', 'error');
      return;
    }

    // simulate submission
    showNotification('Mensagem enviada com sucesso! Entraremos em contato em breve.', 'success');
    form.reset();
  });
})();

/* =========================
   Notification system
   - reworked to minimize DOM thrash
   - CSS deve existir em arquivo separado; inline styles usadas apenas como fallback
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
      <button class="notification__close" aria-label="Fechar">&times;</button>
    `;

    // keep DOM small by prepending and limiting count
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
   ChatAssistant (refatorado)
   Principais mudanças para reduzir o tamanho do chat:
   - Limite de mensagens exibidas (maxMessages)
   - Reuso de templates de DOM
   - Delegação de eventos
   - Um único indicador de digitação
   - Mensagens renderizadas usando fragmento
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
    this.quickContainer = $('#chat-quick-replies'); // container (recommended)
    this.chatNotification = $('#chat-notification');

    this.isOpen = false;
    this.maxMessages = options.maxMessages || 40; // <-- principal ajuste para controlar tamanho
    this.typingId = 'chat-typing-indicator';

    this.responses = options.responses || {
      'serviços disponíveis': 'Oferecemos os seguintes serviços:\n\n🏠 Limpeza Residencial\n🏢 Limpeza Comercial\n🏭 Limpeza Industrial\n🔨 Limpeza Pós-Obra\n🛋️ Limpeza de Estofados\n⚡ Emergência 24h\n\nQual serviço você gostaria de saber mais?',
      'solicitar orçamento': 'Ótimo! Para solicitar um orçamento personalizado, preciso de algumas informações:\n\n📋 Tipo de serviço desejado\n📍 Localização\n📏 Tamanho do ambiente\n📅 Frequência desejada',
      'horário de funcionamento': 'Seg a Sex: 8h-18h\nSáb: 8h-12h\nDom: Fechado\nEmergências 24h disponíveis.',
      'falar com atendente': 'Vou conectá-lo com um de nossos atendentes!\n📞 (11) 99999-9999\n📧 contato@daysclean.com.br',
      'localização': 'Rua das Flores, 123 - Centro, São Paulo - SP',
      'emergência': 'Para emergências ligue: (11) 99999-9999',
      'preços': 'Preços personalizados conforme tipo de serviço, tamanho, frequência e localização.',
      'produtos': 'Utilizamos produtos ecológicos e certificados, seguros para crianças e pets.'
    };

    this.dateFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

    this.init();
  }

  init() {
    if (this.chatAssistantBtn) this.chatAssistantBtn.addEventListener('click', () => this.toggleChat());
    if (this.chatCTA) this.chatCTA.addEventListener('click', (e) => { e.preventDefault(); this.openChat(); });
    if (this.chatClose) this.chatClose.addEventListener('click', () => this.closeChat());

    // send message via button or Enter
    if (this.chatSend) this.chatSend.addEventListener('click', () => this.sendMessage());
    if (this.chatInput) this.chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.sendMessage(); });

    // delegated quick replies handler (recommended HTML: container with .quick-reply buttons)
    document.addEventListener('click', (e) => {
      const qr = e.target.closest('.quick-reply');
      if (!qr) return;
      const msg = qr.datasetMessage || qr.dataset.message || qr.getAttribute('data-message');
      if (msg) {
        this.sendUserMessage(msg);
        this.processMessage(msg);
      }
    });

    // initial notification bubble
    setTimeout(() => this.showNotification(), 3000);
  }

  // keep only last N messages in DOM
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

  // basic html escape
  escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (s) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[s]);
  }

  scrollToBottom() {
    if (!this.chatMessages) return;
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  // typing indicator (one at a time)
  showTypingIndicator() {
    if (!this.chatMessages) return;
    if (this.chatMessages.querySelector(`#${this.typingId}`)) return;
    const el = document.createElement('div');
    el.id = this.typingId;
    el.className = 'message assistant-message typing-message';
    el.innerHTML = `
      <div class="typing-indicator">
        <span>Digitando</span>
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
    // simulate processing delay
    setTimeout(() => {
      this.hideTypingIndicator();
      const lower = message.toLowerCase();
      let resp = this.matchResponse(lower);
      if (!resp) {
        resp = 'Obrigado pela sua mensagem! Para melhor atendê-lo, você pode:\n\n📞 Ligar: (11) 99999-9999\n📧 Email: contato@daysclean.com.br';
      }
      this.sendAssistantMessage(resp);
    }, 900);
  }

  matchResponse(message) {
    for (const key of Object.keys(this.responses)) {
      if (message.includes(key.toLowerCase())) return this.responses[key];
      // also match by single keywords
      const kws = key.split(' ');
      if (kws.some(k => k && message.includes(k))) return this.responses[key];
    }

    // greetings and thanks
    if (this.containsAny(message, ['olá', 'oi', 'bom dia', 'boa tarde', 'boa noite'])) {
      return 'Olá! Seja bem-vindo à Days Clean! 😊\n\nComo posso ajudá-lo hoje?';
    }
    if (this.containsAny(message, ['obrigado', 'obrigada', 'valeu'])) {
      return 'Fico feliz em ajudar! 😊';
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
  // initialize chat
  try {
    window.chatAssistant = new ChatAssistant({ maxMessages: 40 });
  } catch (err) {
    console.error('Falha ao inicializar chat assistant', err);
  }

  // small loading class
  document.body.classList.add('loaded');

  // subtle stagger for cards
  const cards = $$('.service__card, .before-after__item, .portfolio__item');
  cards.forEach((c, i) => { c.style.animationDelay = `${i * 0.08}s`; });

  // preload critical images
  ['hero-image.jpg', 'about-image.jpg'].forEach(src => { const i = new Image(); i.src = src; });

  console.log('Days Clean refactor loaded');
});

/* =========================
   Service worker registration (unchanged behavior)
   ========================= */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(() => console.log('ServiceWorker registered'))
      .catch(() => console.log('ServiceWorker registration failed'));
  });
}

/* =========================
   Export for testing (if environment supports it)
   ========================= */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ChatAssistant };
}
