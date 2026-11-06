<template>
  <div class="support-page">
    <div class="support-container">
      <header class="support-hero">
        <div class="hero-copy">
          <span class="eyebrow"><span class="eyebrow-dot"></span> Atención a clientes</span>
          <h1>Estamos aquí para ayudarte a seguir avanzando.</h1>
          <p>
            Encuentra orientación sobre LEMARQUET POS y conoce las opciones de
            atención disponibles en nuestro sitio oficial.
          </p>
          <a
            class="website-button"
            href="https://lemarquet.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Visitar lemarquet.com
            <span aria-hidden="true">↗</span>
          </a>
          <small class="external-note">Se abrirá el sitio oficial en una nueva pestaña.</small>
        </div>

        <div class="hero-illustration" aria-hidden="true">
          <div class="illustration-orbit orbit-one"></div>
          <div class="illustration-orbit orbit-two"></div>
          <div class="support-icon">
            <svg viewBox="0 0 64 64" fill="none">
              <path d="M12 34v-4a20 20 0 0 1 40 0v4" />
              <path d="M12 33h7a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4h-3a4 4 0 0 1-4-4V33Zm40 0h-7a4 4 0 0 0-4 4v9a4 4 0 0 0 4 4h3a4 4 0 0 0 4-4V33Z" />
              <path d="M45 51a14 14 0 0 1-13 7h-5" />
              <path d="M24 58h7" />
            </svg>
          </div>
          <span class="illustration-label">Contamos contigo</span>
        </div>
      </header>

      <section class="support-topics" aria-labelledby="topics-title">
        <div class="section-heading">
          <span class="section-kicker">¿EN QUÉ PODEMOS ORIENTARTE?</span>
          <h2 id="topics-title">Acompañamiento para tu operación</h2>
          <p>En el sitio oficial podrás consultar la información y las opciones de contacto disponibles.</p>
        </div>

        <div class="topic-grid">
          <article class="topic-card">
            <span class="topic-number">01</span>
            <span class="topic-icon icon-sales" aria-hidden="true">↗</span>
            <h3>Ventas y punto de venta</h3>
            <p>Orientación sobre el flujo de venta, los cobros y el uso diario de LEMARQUET POS.</p>
          </article>
          <article class="topic-card">
            <span class="topic-number">02</span>
            <span class="topic-icon icon-cash" aria-hidden="true">◷</span>
            <h3>Caja y turnos</h3>
            <p>Información para gestionar aperturas, movimientos y cierres de caja.</p>
          </article>
          <article class="topic-card">
            <span class="topic-number">03</span>
            <span class="topic-icon icon-inventory" aria-hidden="true">▦</span>
            <h3>Productos e inventario</h3>
            <p>Ayuda relacionada con el catálogo, las existencias y el control de productos.</p>
          </article>
          <article class="topic-card">
            <span class="topic-number">04</span>
            <span class="topic-icon icon-account" aria-hidden="true">◎</span>
            <h3>Cuenta y facturación</h3>
            <p>Consulta información relacionada con tu cuenta, suscripción y facturas.</p>
          </article>
        </div>
      </section>

      <footer class="support-footer">
        <div>
          <strong>¿Listo para encontrar más información?</strong>
          <p>Visita nuestro sitio oficial para conocer los canales de atención disponibles.</p>
        </div>
        <a href="https://lemarquet.com/" target="_blank" rel="noopener noreferrer">
          Ir al sitio oficial <span aria-hidden="true">→</span>
        </a>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.support-page {
  min-height: 100%;
  padding: 2rem 0 3rem;
  background: #f5f7fa;
}

.support-container {
  width: min(100% - 3rem, 1180px);
  margin: 0 auto;
}

.support-hero {
  position: relative;
  display: flex;
  min-height: 330px;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  overflow: hidden;
  padding: 3rem clamp(1.5rem, 5vw, 4.5rem);
  border: 1px solid #dfe6f0;
  border-radius: 18px;
  background:
    radial-gradient(ellipse at 86% 16%, rgba(116, 150, 231, 0.18), transparent 31%),
    linear-gradient(120deg, #fff 0%, #f8faff 55%, #edf2ff 100%);
  box-shadow: 0 14px 40px rgba(27, 47, 86, 0.06);
}

.hero-copy {
  position: relative;
  z-index: 1;
  max-width: 650px;
}

.eyebrow,
.section-kicker {
  color: #526dc1;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.eyebrow-dot {
  width: 0.48rem;
  height: 0.48rem;
  border-radius: 50%;
  background: #6684dc;
  box-shadow: 0 0 0 4px #e9edfb;
}

.hero-copy h1 {
  max-width: 620px;
  margin: 1rem 0 0.85rem;
  color: #1d2b49;
  font-size: clamp(2rem, 4vw, 3.2rem);
  font-weight: 750;
  letter-spacing: -0.045em;
  line-height: 1.1;
}

.hero-copy p {
  max-width: 550px;
  margin: 0;
  color: #69768c;
  font-size: 0.96rem;
  line-height: 1.75;
}

.website-button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  gap: 1rem;
  margin-top: 1.5rem;
  padding: 0.75rem 1.1rem;
  border: 1px solid #29499f;
  border-radius: 8px;
  background: #29499f;
  color: #fff;
  font-size: 0.83rem;
  font-weight: 750;
  text-decoration: none;
  box-shadow: 0 6px 16px rgba(41, 73, 159, 0.18);
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.website-button:hover {
  transform: translateY(-2px);
  background: #203d8c;
  box-shadow: 0 9px 22px rgba(41, 73, 159, 0.24);
}

.website-button:focus-visible,
.support-footer a:focus-visible {
  outline: 3px solid #aebff5;
  outline-offset: 3px;
}

.external-note {
  display: block;
  margin-top: 0.65rem;
  color: #8792a5;
  font-size: 0.68rem;
}

.hero-illustration {
  position: relative;
  display: grid;
  width: 230px;
  height: 230px;
  flex: 0 0 auto;
  place-items: center;
  margin-right: 3%;
  border: 1px solid rgba(123, 147, 211, 0.25);
  border-radius: 50%;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.78), rgba(226, 234, 255, 0.72));
}

.illustration-orbit {
  position: absolute;
  border: 1px solid rgba(86, 113, 190, 0.19);
  border-radius: 50%;
}

.orbit-one {
  inset: -18px;
}

.orbit-two {
  inset: 18px;
}

.support-icon {
  display: grid;
  width: 96px;
  height: 96px;
  place-items: center;
  border: 1px solid #d7e0f7;
  border-radius: 28px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(49, 74, 139, 0.13);
}

.support-icon svg {
  width: 52px;
  stroke: #3959ab;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.3;
}

.illustration-label {
  position: absolute;
  right: -14px;
  bottom: 26px;
  padding: 0.55rem 0.75rem;
  border: 1px solid #e5eaf4;
  border-radius: 7px;
  background: #fff;
  color: #435681;
  font-size: 0.7rem;
  font-weight: 750;
  box-shadow: 0 7px 20px rgba(36, 54, 91, 0.09);
}

.support-topics {
  padding: 3.5rem 0 2.5rem;
}

.section-heading {
  max-width: 650px;
  margin-bottom: 1.4rem;
}

.section-heading h2 {
  margin: 0.55rem 0 0.45rem;
  color: #25334e;
  font-size: clamp(1.5rem, 3vw, 2rem);
  letter-spacing: -0.035em;
}

.section-heading p {
  margin: 0;
  color: #748096;
  font-size: 0.85rem;
  line-height: 1.65;
}

.topic-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.85rem;
}

.topic-card {
  position: relative;
  min-height: 205px;
  padding: 1.25rem;
  border: 1px solid #e2e7ef;
  border-radius: 11px;
  background: #fff;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.topic-card:hover {
  transform: translateY(-3px);
  border-color: #cbd6f0;
  box-shadow: 0 10px 24px rgba(28, 47, 83, 0.07);
}

.topic-number {
  position: absolute;
  top: 1.15rem;
  right: 1.15rem;
  color: #a4adbc;
  font-size: 0.66rem;
  font-weight: 750;
}

.topic-icon {
  display: grid;
  width: 2.45rem;
  height: 2.45rem;
  place-items: center;
  margin-bottom: 1.05rem;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 1.15rem;
  font-weight: 750;
}

.icon-sales { color: #4262bd; background: #eef2ff; border-color: #dce4ff; }
.icon-cash { color: #a8752b; background: #fff7e8; border-color: #f5e8cb; }
.icon-inventory { color: #37815e; background: #edf8f1; border-color: #d8eedf; }
.icon-account { color: #7758a9; background: #f4effb; border-color: #e8def5; }

.topic-card h3 {
  margin: 0 0 0.45rem;
  color: #35425a;
  font-size: 0.92rem;
  letter-spacing: -0.01em;
}

.topic-card p {
  margin: 0;
  color: #778398;
  font-size: 0.75rem;
  line-height: 1.65;
}

.support-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.4rem 1.6rem;
  border: 1px solid #e2e7ef;
  border-radius: 11px;
  background: #fff;
}

.support-footer strong {
  color: #34415a;
  font-size: 0.9rem;
}

.support-footer p {
  margin: 0.35rem 0 0;
  color: #7a8699;
  font-size: 0.76rem;
}

.support-footer a {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.7rem;
  color: #3654a6;
  font-size: 0.78rem;
  font-weight: 750;
  text-decoration: none;
}

.support-footer a:hover {
  color: #203d8c;
}

@media (max-width: 900px) {
  .topic-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .support-page {
    padding: 1rem 0 2rem;
  }

  .support-container {
    width: calc(100% - 1.5rem);
  }

  .support-hero {
    min-height: auto;
    padding: 1.6rem 1.25rem;
  }

  .hero-illustration {
    display: none;
  }

  .hero-copy h1 {
    font-size: clamp(1.85rem, 9vw, 2.55rem);
  }

  .support-topics {
    padding: 2.5rem 0 1.5rem;
  }

  .topic-grid {
    gap: 0.65rem;
  }

  .topic-card {
    min-height: 190px;
    padding: 1rem;
  }

  .topic-number {
    top: 0.95rem;
    right: 0.85rem;
  }

  .topic-card h3 {
    font-size: 0.82rem;
  }

  .topic-card p {
    font-size: 0.72rem;
  }

  .support-footer {
    align-items: flex-start;
    flex-direction: column;
    padding: 1.15rem;
  }
}

@media (max-width: 380px) {
  .topic-grid {
    grid-template-columns: 1fr;
  }

  .topic-card {
    min-height: 0;
  }
}
</style>
