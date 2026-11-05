<template>
  <div class="landing-page">
    <header class="site-header">
      <a class="brand" href="#inicio" aria-label="LEMARQUET POS, inicio">
        <span class="brand-symbol">L</span>
        <span class="brand-name">LEMARQUET<span>POS</span></span>
      </a>

      <nav class="site-nav" aria-label="Navegación de la página">
        <a href="#beneficios">Beneficios</a>
        <a href="#funciones">Funciones</a>
        <a href="#como-funciona">Cómo funciona</a>
      </nav>

      <div class="header-actions">
        <RouterLink class="login-link" to="/login">Iniciar sesión</RouterLink>
        <RouterLink class="button button-small button-dark" :to="subscriptionLink">
          Ver planes <span aria-hidden="true">↗</span>
        </RouterLink>
      </div>
    </header>

    <main>
      <section id="inicio" class="hero section-shell">
        <div class="hero-copy">
          <div class="eyebrow"><span class="eyebrow-dot"></span> Punto de venta para tu negocio</div>
          <h1>Vende con agilidad.<br /><span>Administra con claridad.</span></h1>
          <p class="hero-description">
            Cobra, controla tu caja y mantén tu inventario en orden desde un solo lugar.
            LEMARQUET POS te ayuda a simplificar la operación diaria para que puedas
            concentrarte en atender mejor a tus clientes.
          </p>
          <div class="hero-actions">
            <RouterLink class="button button-primary" :to="subscriptionLink">
              Conoce los planes <span aria-hidden="true">→</span>
            </RouterLink>
            <a class="text-link" href="#funciones">Explorar funcionalidades <span aria-hidden="true">↓</span></a>
          </div>
          <div class="hero-note">
            <span class="note-icon" aria-hidden="true">✓</span>
            Consulta el plan y las opciones de contratación para tu organización.
          </div>
        </div>

        <div class="hero-visual" aria-label="Vista ilustrativa de una venta en el sistema POS">
          <div class="visual-glow"></div>
          <div class="visual-caption"><span></span> Una operación más ordenada, desde la primera venta</div>
          <div class="pos-window">
            <div class="window-topbar">
              <div class="window-brand"><span class="mini-mark">L</span> LEMARQUET <small>POS</small></div>
              <div class="window-status"><i></i> Caja activa</div>
              <div class="window-avatar">OP</div>
            </div>
            <div class="window-body">
              <div class="window-catalog">
                <div class="window-title-row"><div><small>VENTA ACTUAL</small><strong>Catálogo de productos</strong></div><span class="search-chip">⌕ <span>Buscar producto</span></span></div>
                <div class="product-list">
                  <div class="mock-product"><span class="product-icon product-blue">◈</span><span class="mock-product-copy"><strong>Producto de muestra</strong><small>PIEZA · Disponible</small></span><b>$—</b><span class="add-symbol">+</span></div>
                  <div class="mock-product"><span class="product-icon product-lilac">▧</span><span class="mock-product-copy"><strong>Artículo de muestra</strong><small>PIEZA · Disponible</small></span><b>$—</b><span class="add-symbol">+</span></div>
                  <div class="mock-product"><span class="product-icon product-mint">⚖</span><span class="mock-product-copy"><strong>Venta por peso</strong><small>KG · Báscula opcional</small></span><b>$—</b><span class="add-symbol">+</span></div>
                </div>
              </div>
              <aside class="window-cart">
                <div class="cart-title"><strong>Tu venta</strong><span>Carrito</span></div>
                <div class="cart-empty-icon">＋</div>
                <p>Agrega productos<br />para iniciar el cobro</p>
                <div class="cart-total"><span>Total de la venta</span><strong>Se calcula al cobrar</strong></div>
                <div class="mock-checkout">Continuar al cobro <span>→</span></div>
              </aside>
            </div>
            <div class="window-footer"><span><i></i> Flujo de venta sencillo</span><span>Catálogo · Caja · Cobro</span></div>
          </div>
          <div class="floating-card floating-card-top"><span class="float-icon">▤</span><span><strong>Tu caja, bajo control</strong><small>Apertura, ventas y arqueo</small></span></div>
          <div class="floating-card floating-card-bottom"><span class="float-check">✓</span><span><strong>Información en un solo lugar</strong><small>Ventas, inventario y reportes</small></span></div>
        </div>
      </section>

      <section class="value-strip" aria-label="Resumen de beneficios">
        <div class="value-strip-inner">
          <span><i>01</i> Cobra con un flujo claro</span>
          <span><i>02</i> Lleva el control de tu caja</span>
          <span><i>03</i> Consulta tu operación</span>
          <span><i>04</i> Administra desde un solo sistema</span>
        </div>
      </section>

      <section id="beneficios" class="benefits-section section-shell">
        <div class="section-heading">
          <span class="section-kicker">MENOS FRICCIÓN EN TU DÍA A DÍA</span>
          <h2>Tu negocio merece algo más que una caja registradora.</h2>
          <p>Reúne las tareas clave de venta y administración en una herramienta hecha para la operación cotidiana.</p>
        </div>
        <div class="benefit-grid">
          <article class="benefit-card benefit-featured">
            <div class="benefit-icon icon-navy">↗</div>
            <span class="card-index">01 / VENTA</span>
            <h3>Atiende y cobra sin pasos innecesarios</h3>
            <p>Busca por nombre o código, agrega productos al carrito y consulta el total antes de confirmar el pago.</p>
            <a href="#funciones">Conoce el punto de venta <span>→</span></a>
            <div class="decorative-lines" aria-hidden="true"><i></i><i></i><i></i></div>
          </article>
          <article class="benefit-card">
            <div class="benefit-icon icon-amber">◷</div>
            <span class="card-index">02 / CAJA</span>
            <h3>Cierra cada turno con más control</h3>
            <p>Registra el fondo inicial, revisa las ventas y compara el efectivo esperado con el dinero contado.</p>
          </article>
          <article class="benefit-card">
            <div class="benefit-icon icon-green">▦</div>
            <span class="card-index">03 / INVENTARIO</span>
            <h3>Ten tus existencias a la vista</h3>
            <p>Consulta stock, detecta niveles bajos y administra productos y movimientos desde el módulo de inventario.</p>
          </article>
          <article class="benefit-card">
            <div class="benefit-icon icon-violet">▥</div>
            <span class="card-index">04 / INFORMACIÓN</span>
            <h3>Decide con datos de tu operación</h3>
            <p>Revisa ventas por período, transacciones y resultados de caja. Exporta reportes para compartirlos o analizarlos.</p>
          </article>
        </div>
      </section>

      <section id="funciones" class="features-section">
        <div class="features-layout section-shell">
          <div class="features-intro">
            <span class="section-kicker section-kicker-light">HERRAMIENTAS PARA OPERAR MEJOR</span>
            <h2>Todo lo esencial para llevar el ritmo de tu negocio.</h2>
            <p>Desde el primer producto de una venta hasta el cierre del turno, cada función está pensada para hacer más visible y manejable el trabajo diario.</p>
            <RouterLink class="button button-light" :to="subscriptionLink">Ver opciones de contratación <span>→</span></RouterLink>
          </div>
          <div class="feature-list">
            <article><span class="feature-number">01</span><div><h3>Ventas y pagos</h3><p>Catálogo con búsqueda, carrito, descuentos y cobro en efectivo o con referencia de terminal.</p></div><span class="feature-arrow">↗</span></article>
            <article><span class="feature-number">02</span><div><h3>Productos por pieza o peso</h3><p>Registra artículos por unidad y productos por kilogramo; la lectura de báscula depende del equipo compatible.</p></div><span class="feature-arrow">↗</span></article>
            <article><span class="feature-number">03</span><div><h3>Control de turnos</h3><p>Gestiona apertura, ventas del turno, efectivo esperado, arqueo e historial de caja.</p></div><span class="feature-arrow">↗</span></article>
            <article><span class="feature-number">04</span><div><h3>Inventario y reportes</h3><p>Administra existencias, importa productos y consulta informes de ventas e inventario.</p></div><span class="feature-arrow">↗</span></article>
            <article><span class="feature-number">05</span><div><h3>Herramientas para tu equipo</h3><p>Asigna accesos según el rol y conecta impresora o cajón mediante el agente local compatible.</p></div><span class="feature-arrow">↗</span></article>
          </div>
        </div>
      </section>

      <section id="como-funciona" class="workflow-section section-shell">
        <div class="section-heading">
          <span class="section-kicker">CLARO PARA TU EQUIPO</span>
          <h2>De abrir la caja a cerrar el turno.</h2>
          <p>Un recorrido fácil de entender para que cada persona sepa qué hacer en su jornada.</p>
        </div>
        <div class="workflow-grid">
          <article><span class="step-number">1</span><div class="step-line"></div><h3>Abre tu turno</h3><p>Ingresa con tu usuario y registra el efectivo inicial de la caja.</p></article>
          <article><span class="step-number">2</span><div class="step-line"></div><h3>Registra cada venta</h3><p>Busca o escanea productos, confirma cantidades y elige el método de pago.</p></article>
          <article><span class="step-number">3</span><div class="step-line"></div><h3>Revisa y haz el arqueo</h3><p>Compara el efectivo esperado con el contado antes de cerrar el turno.</p></article>
          <article><span class="step-number">4</span><div class="step-line"></div><h3>Administra tu negocio</h3><p>Consulta reportes, existencias y actividad del equipo desde el panel administrativo.</p></article>
        </div>
      </section>

      <section class="offline-section section-shell">
        <div class="offline-card">
          <div class="offline-symbol"><span>↻</span><i></i></div>
          <div class="offline-copy">
            <span class="section-kicker">PREPARADO PARA CONTINGENCIAS DE CONEXIÓN</span>
            <h2>Que una interrupción de red no te tome por sorpresa.</h2>
            <p>El POS puede conservar ventas pendientes en el dispositivo e intentar sincronizarlas cuando vuelva la conexión. La operación sin conexión es parcial; para sincronizar y usar los módulos administrativos se necesita acceso al backend.</p>
          </div>
          <div class="offline-status"><span></span> Sincronización pendiente<br /><small>Se reintenta al recuperar la conexión</small></div>
        </div>
      </section>

      <section class="audience-section section-shell">
        <div class="audience-copy">
          <span class="section-kicker">PARA NEGOCIOS QUE QUIEREN MÁS CONTROL</span>
          <h2>Una herramienta práctica para quienes venden todos los días.</h2>
          <p>Si necesitas agilizar el cobro, tener una lectura más clara de la caja o dejar de depender de registros dispersos, LEMARQUET POS reúne esas tareas en una misma operación.</p>
        </div>
        <div class="audience-points">
          <div><span>✓</span><p><strong>Menos trabajo duplicado</strong><small>Registra ventas y consulta la actividad desde un sistema común.</small></p></div>
          <div><span>✓</span><p><strong>Más claridad al cerrar</strong><small>Compara el efectivo esperado con el conteo del turno.</small></p></div>
          <div><span>✓</span><p><strong>Una mejor vista de tus existencias</strong><small>Consulta productos y recibe información de stock bajo.</small></p></div>
          <div><span>✓</span><p><strong>Roles para tu equipo</strong><small>Separa el acceso operativo de las funciones administrativas disponibles.</small></p></div>
        </div>
      </section>

      <section class="faq-section section-shell">
        <div class="faq-heading">
          <span class="section-kicker">PREGUNTAS FRECUENTES</span>
          <h2>Antes de dar el siguiente paso.</h2>
        </div>
        <div class="faq-list">
          <details><summary>¿Qué incluye el sistema POS?<span>+</span></summary><p>Incluye punto de venta, caja y arqueo, catálogo, administración de inventario, reportes, empleados, facturas, configuración y gestión de suscripción. El acceso a cada módulo depende del rol asignado.</p></details>
          <details><summary>¿Puedo usarlo si se cae internet?<span>+</span></summary><p>El flujo POS puede guardar algunas ventas pendientes en el dispositivo para intentar sincronizarlas después. No todos los módulos funcionan sin conexión y la sincronización requiere que el backend vuelva a estar disponible.</p></details>
          <details><summary>¿Puedo usar impresora o báscula?<span>+</span></summary><p>El sistema contempla la conexión de hardware a través de un agente local. La compatibilidad y operación dependen de instalarlo y configurar dispositivos compatibles en el equipo.</p></details>
          <details><summary>¿Cuánto cuesta y cómo puedo contratarlo?<span>+</span></summary><p>Consulta el plan vigente y su disponibilidad desde la sección de suscripción. El precio y la contratación en línea dependen de que el plan y el servicio de pago estén habilitados para tu organización.</p></details>
          <details><summary>¿El sistema emite facturas fiscales timbradas?<span>+</span></summary><p>El POS cuenta con un módulo de facturas y representaciones de venta. La generación de un registro en el sistema no garantiza por sí sola el timbrado fiscal ante el SAT; confirma con el proveedor la disponibilidad de esa integración.</p></details>
        </div>
      </section>

      <section class="closing-section section-shell">
        <div class="closing-card">
          <div class="closing-orb closing-orb-one"></div><div class="closing-orb closing-orb-two"></div>
          <div class="closing-content">
            <span class="section-kicker section-kicker-light">DA EL SIGUIENTE PASO</span>
            <h2>Haz que cada venta cuente.<br />Y que tu operación se note.</h2>
            <p>Conoce el plan disponible para tu organización y descubre cómo llevar tu punto de venta con más orden y visibilidad.</p>
            <RouterLink class="button button-primary button-cta" :to="subscriptionLink">
              {{ isAuthenticated ? 'Ir a planes y contratación' : 'Ver planes y contratación' }} <span>→</span>
            </RouterLink>
            <small v-if="!isAuthenticated">Para iniciar la contratación en línea necesitarás acceder con una cuenta de tu organización.</small>
          </div>
          <div class="closing-mark" aria-hidden="true">L</div>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <a class="brand footer-brand" href="#inicio"><span class="brand-symbol">L</span><span class="brand-name">LEMARQUET<span>POS</span></span></a>
      <p>Una operación más clara empieza con cada venta.</p>
      <a href="#inicio">Volver arriba ↑</a>
      <small>© {{ currentYear }} LEMARQUET POS</small>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/authStore'

const authStore = useAuthStore()
const isAuthenticated = computed(() => authStore.isAuthenticated)
const subscriptionLink = computed(() => isAuthenticated.value ? '/suscripcion' : '/planes')
const currentYear = new Date().getFullYear()
</script>

<style scoped>
.landing-page {
  --ink: #172033;
  --muted: #647084;
  --blue: #3158d8;
  --line: #e7eaf0;
  min-height: 100%;
  overflow: hidden;
  background: #fff;
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.section-shell,
.site-header,
.value-strip-inner,
.site-footer {
  width: min(1160px, calc(100% - 64px));
  margin-inline: auto;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 82px;
  gap: 1.5rem;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--ink);
  text-decoration: none;
}

.brand-symbol,
.mini-mark {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 37px;
  height: 37px;
  border-radius: 12px;
  background: #1d2b4d;
  color: #fff;
  font-size: 1.2rem;
  font-weight: 850;
  font-style: italic;
}

.brand-name {
  font-size: 0.91rem;
  font-weight: 850;
  letter-spacing: 0.07em;
}

.brand-name > span {
  margin-left: 0.35rem;
  color: var(--blue);
  font-size: 0.72rem;
  letter-spacing: 0.12em;
}

.site-nav,
.header-actions {
  display: flex;
  align-items: center;
}

.site-nav { gap: 2rem; }
.site-nav a,
.login-link {
  color: #515c70;
  font-size: 0.84rem;
  font-weight: 600;
  text-decoration: none;
  transition: color 0.18s ease;
}
.site-nav a:hover,
.login-link:hover { color: var(--blue); }
.header-actions { gap: 1.4rem; }

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-height: 52px;
  padding: 0.9rem 1.35rem;
  border: 1px solid transparent;
  border-radius: 9px;
  font-size: 0.9rem;
  font-weight: 720;
  text-decoration: none;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}
.button:hover { transform: translateY(-2px); }
.button-small { min-height: 41px; padding: 0.65rem 1rem; font-size: 0.8rem; }
.button-dark { background: #1d2b4d; color: #fff; box-shadow: 0 5px 14px #1d2b4d20; }
.button-dark:hover { background: #263a68; box-shadow: 0 8px 18px #1d2b4d2b; }
.button-primary { background: var(--blue); color: #fff; box-shadow: 0 8px 20px #3158d82b; }
.button-primary:hover { background: #264bc5; box-shadow: 0 10px 24px #3158d83d; }

.hero {
  display: grid;
  grid-template-columns: 0.96fr 1.04fr;
  align-items: center;
  gap: 2rem;
  min-height: 595px;
  padding-block: 4.2rem 5rem;
}

.hero-copy { position: relative; z-index: 1; padding-block: 1rem; }
.eyebrow,
.section-kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  color: #68758a;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.13em;
  line-height: 1.5;
}
.eyebrow {
  padding: 0.48rem 0.75rem;
  border: 1px solid #e6eafb;
  border-radius: 999px;
  background: #f7f8ff;
  color: #445ca2;
  letter-spacing: 0.025em;
  font-size: 0.76rem;
}
.eyebrow-dot { width: 7px; height: 7px; border-radius: 50%; background: #4a70e4; box-shadow: 0 0 0 4px #4a70e41b; }
.hero h1 {
  margin: 1.6rem 0 1.15rem;
  color: #18243a;
  font-size: clamp(2.7rem, 5vw, 4.35rem);
  font-weight: 800;
  letter-spacing: -0.065em;
  line-height: 1.05;
}
.hero h1 span { color: #526a9b; }
.hero-description {
  max-width: 525px;
  color: #677286;
  font-size: 1rem;
  line-height: 1.8;
}
.hero-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 1.2rem; margin-top: 1.8rem; }
.text-link { color: #4a5870; font-size: 0.84rem; font-weight: 700; text-decoration: none; }
.text-link span { margin-left: 0.25rem; color: var(--blue); }
.hero-note { display: flex; align-items: center; gap: 0.55rem; margin-top: 1.4rem; color: #778194; font-size: 0.75rem; }
.note-icon { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: #e8f5ed; color: #228455; font-size: 0.69rem; font-weight: 900; }

.hero-visual { position: relative; display: flex; min-height: 400px; align-items: center; justify-content: center; isolation: isolate; }
.visual-glow { position: absolute; z-index: -1; width: 78%; height: 76%; border-radius: 50%; background: radial-gradient(ellipse, #eaf0ff 0%, #f5f7ff 55%, #fff 76%); filter: blur(7px); }
.visual-caption { position: absolute; top: 0.2rem; right: 3%; color: #8490a2; font-size: 0.68rem; }
.visual-caption span { display: inline-block; width: 6px; height: 6px; margin-right: 0.38rem; border-radius: 50%; background: #4b71df; }
.pos-window { position: relative; z-index: 1; width: min(100%, 520px); overflow: hidden; border: 1px solid #e1e6ef; border-radius: 14px; background: #fff; box-shadow: 0 28px 75px #283e6920, 0 5px 14px #2637520b; transform: perspective(1000px) rotateY(-5deg) rotateX(2deg); }
.window-topbar { display: flex; height: 55px; align-items: center; gap: 0.8rem; padding: 0 1rem; border-bottom: 1px solid #edf0f5; }
.window-brand { display: flex; align-items: center; gap: 0.45rem; margin-right: auto; color: #27344b; font-size: 0.61rem; font-weight: 850; letter-spacing: 0.09em; }
.window-brand small { color: #5571bb; font-size: 0.55rem; }
.mini-mark { width: 25px; height: 25px; border-radius: 7px; font-size: 0.82rem; }
.window-status { display: flex; align-items: center; gap: 0.36rem; color: #626e81; font-size: 0.62rem; }
.window-status i,
.window-footer i { width: 6px; height: 6px; border-radius: 50%; background: #36a46b; }
.window-avatar { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 50%; background: #eff2f8; color: #495976; font-size: 0.56rem; font-weight: 800; }
.window-body { display: grid; grid-template-columns: 1fr 165px; gap: 1rem; padding: 1rem; background: #fbfcfe; }
.window-title-row { display: flex; align-items: center; justify-content: space-between; gap: 0.4rem; margin-bottom: 0.8rem; }
.window-title-row > div { display: grid; gap: 0.28rem; }
.window-title-row small { color: #8a94a5; font-size: 0.5rem; font-weight: 750; letter-spacing: 0.11em; }
.window-title-row strong { color: #25334b; font-size: 0.77rem; }
.search-chip { padding: 0.38rem 0.5rem; border: 1px solid #e9edf3; border-radius: 5px; background: #fff; color: #60718a; font-size: 0.74rem; }
.search-chip > span { margin-left: 0.2rem; color: #a0a9b6; font-size: 0.54rem; }
.product-list { display: grid; gap: 0.48rem; }
.mock-product { display: flex; min-height: 57px; align-items: center; gap: 0.55rem; padding: 0.5rem; border: 1px solid #edf0f5; border-radius: 7px; background: #fff; }
.product-icon { display: grid; place-items: center; width: 31px; height: 31px; flex: 0 0 auto; border-radius: 7px; font-size: 0.85rem; }
.product-blue { background: #edf2ff; color: #4f70d6; }
.product-lilac { background: #f2efff; color: #7d68c4; }
.product-mint { background: #e8f6f0; color: #40876a; }
.mock-product-copy { display: grid; min-width: 0; gap: 0.18rem; margin-right: auto; }
.mock-product-copy strong { overflow: hidden; color: #36435a; font-size: 0.59rem; text-overflow: ellipsis; white-space: nowrap; }
.mock-product-copy small { color: #929cad; font-size: 0.49rem; }
.mock-product > b { color: #263550; font-size: 0.59rem; }
.add-symbol { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 5px; background: #eef2ff; color: #4261cc; font-size: 0.8rem; }
.window-cart { display: flex; min-height: 230px; flex-direction: column; align-items: center; padding: 0.75rem 0.6rem; border: 1px solid #e9edf3; border-radius: 8px; background: #fff; }
.cart-title { display: flex; width: 100%; justify-content: space-between; color: #344158; font-size: 0.64rem; }
.cart-title span { color: #929bac; font-size: 0.55rem; }
.cart-empty-icon { display: grid; place-items: center; width: 37px; height: 37px; margin-top: 1.2rem; border-radius: 50%; background: #f1f3f8; color: #7a8baa; font-size: 1.1rem; }
.window-cart > p { margin: 0.6rem 0 auto; color: #8893a4; font-size: 0.57rem; line-height: 1.6; text-align: center; }
.cart-total { display: grid; width: 100%; gap: 0.38rem; padding: 0.6rem 0; border-top: 1px solid #edf0f4; color: #7b8698; font-size: 0.53rem; }
.cart-total strong { color: #344158; font-size: 0.59rem; }
.mock-checkout { display: flex; width: 100%; justify-content: space-between; padding: 0.52rem; border-radius: 5px; background: #3158d8; color: #fff; font-size: 0.56rem; font-weight: 700; }
.window-footer { display: flex; justify-content: space-between; padding: 0.65rem 1rem; border-top: 1px solid #edf0f5; background: #fff; color: #8993a3; font-size: 0.54rem; }
.window-footer > span:first-child { display: flex; align-items: center; gap: 0.35rem; }
.floating-card { position: absolute; z-index: 2; display: flex; align-items: center; gap: 0.65rem; padding: 0.7rem 0.85rem; border: 1px solid #e9ecf3; border-radius: 9px; background: #fff; box-shadow: 0 12px 32px #25355318; }
.floating-card > span:last-child { display: grid; gap: 0.22rem; }
.floating-card strong { color: #334058; font-size: 0.64rem; }
.floating-card small { color: #8993a3; font-size: 0.55rem; }
.floating-card-top { top: 16%; left: -2%; }
.floating-card-bottom { right: -2%; bottom: 12%; }
.float-icon,
.float-check { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: #eef2ff; color: #4567d5; font-size: 0.9rem; }
.float-check { background: #e8f6ee; color: #30865a; font-weight: 900; }

.value-strip { border-block: 1px solid #edf0f4; background: #fafbfd; }
.value-strip-inner { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.85rem 1rem; padding-block: 1.25rem; }
.value-strip-inner > span { display: flex; align-items: center; gap: 0.55rem; color: #5e6a7d; font-size: 0.75rem; font-weight: 650; }
.value-strip-inner i { color: #5874d3; font-size: 0.63rem; font-style: normal; font-weight: 800; }

.benefits-section { padding-block: 7rem 7.3rem; }
.section-heading { max-width: 720px; margin: 0 auto 2.8rem; text-align: center; }
.section-heading h2,
.faq-heading h2 { margin: 0.7rem 0 0.65rem; color: #1d2940; font-size: clamp(2rem, 3.8vw, 3rem); font-weight: 780; letter-spacing: -0.045em; line-height: 1.13; }
.section-heading > p { max-width: 630px; margin: 0 auto; color: #768195; font-size: 0.94rem; line-height: 1.75; }
.benefit-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.benefit-card { position: relative; min-height: 280px; overflow: hidden; padding: 1.35rem; border: 1px solid #e9ecf2; border-radius: 12px; background: #fff; transition: transform 0.2s ease, box-shadow 0.2s ease; }
.benefit-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px #2232500e; }
.benefit-featured { border-color: #273858; background: #1f2e4e; color: #fff; }
.benefit-icon { display: grid; place-items: center; width: 39px; height: 39px; border-radius: 10px; font-size: 1.1rem; font-weight: 800; }
.icon-navy { background: #ffffff19; color: #fff; }
.icon-amber { background: #fff4dc; color: #be831a; }
.icon-green { background: #e8f6ee; color: #368b5f; }
.icon-violet { background: #f0edff; color: #7862c2; }
.card-index { display: block; margin-top: 1.25rem; color: #919bad; font-size: 0.6rem; font-weight: 800; letter-spacing: 0.1em; }
.benefit-featured .card-index { color: #b7c5e1; }
.benefit-card h3 { position: relative; z-index: 1; margin: 0.6rem 0 0.65rem; color: #26334b; font-size: 1.06rem; letter-spacing: -0.02em; line-height: 1.35; }
.benefit-featured h3 { color: #fff; }
.benefit-card p { position: relative; z-index: 1; margin: 0; color: #788397; font-size: 0.79rem; line-height: 1.7; }
.benefit-featured p { color: #d0d9e8; }
.benefit-card a { position: absolute; z-index: 1; bottom: 1.35rem; color: #fff; font-size: 0.72rem; font-weight: 700; text-decoration: none; }
.benefit-card a span { margin-left: 0.35rem; }
.decorative-lines { position: absolute; right: -22px; bottom: 13px; display: flex; align-items: end; gap: 5px; opacity: 0.17; transform: rotate(-24deg); }
.decorative-lines i { display: block; width: 15px; border-radius: 8px; background: #b9c9ed; }
.decorative-lines i:nth-child(1) { height: 58px; }.decorative-lines i:nth-child(2) { height: 83px; }.decorative-lines i:nth-child(3) { height: 108px; }

.features-section { background: #1c2945; color: #fff; }
.features-layout { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 6.5rem; padding-block: 6.7rem; }
.section-kicker-light { color: #b8c5dd; }
.features-intro h2 { margin: 0.9rem 0 1rem; color: #fff; font-size: clamp(2rem, 3.3vw, 2.75rem); font-weight: 770; letter-spacing: -0.045em; line-height: 1.14; }
.features-intro > p { margin: 0 0 1.6rem; color: #b6c1d4; font-size: 0.9rem; line-height: 1.8; }
.button-light { min-height: 46px; background: #fff; color: #243552; font-size: 0.78rem; }
.button-light:hover { background: #eff3fb; }
.feature-list article { display: grid; grid-template-columns: 37px 1fr 18px; align-items: start; gap: 0.9rem; padding: 1.1rem 0; border-bottom: 1px solid #ffffff20; }
.feature-list article:first-child { padding-top: 0; }
.feature-list article:last-child { border-bottom: 0; padding-bottom: 0; }
.feature-number { padding-top: 0.08rem; color: #8da7ed; font-size: 0.65rem; font-weight: 800; }
.feature-list h3 { margin: 0 0 0.3rem; color: #fff; font-size: 0.88rem; font-weight: 700; }
.feature-list p { max-width: 440px; margin: 0; color: #acb8cd; font-size: 0.74rem; line-height: 1.65; }
.feature-arrow { color: #8299d2; font-size: 0.8rem; }

.workflow-section { padding-block: 7rem 7.2rem; }
.workflow-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.35rem; }
.workflow-grid article { position: relative; }
.step-number { display: grid; place-items: center; width: 39px; height: 39px; border: 1px solid #dfe5f2; border-radius: 11px; background: #f5f7ff; color: #4564cd; font-size: 0.82rem; font-weight: 800; }
.step-line { position: absolute; top: 19px; left: 52px; right: -10px; height: 1px; background: #e4e8f0; }
.workflow-grid article:last-child .step-line { display: none; }
.workflow-grid h3 { margin: 1.2rem 0 0.5rem; color: #29364e; font-size: 0.96rem; }
.workflow-grid p { max-width: 230px; margin: 0; color: #7a8598; font-size: 0.79rem; line-height: 1.7; }

.offline-section { padding-bottom: 6rem; }
.offline-card { display: grid; grid-template-columns: 100px 1fr auto; align-items: center; gap: 1.35rem; padding: 2rem; border: 1px solid #e7eaf0; border-radius: 14px; background: #f8faff; }
.offline-symbol { position: relative; display: grid; place-items: center; width: 78px; height: 78px; border-radius: 23px; background: #e9efff; color: #4867d2; }
.offline-symbol span { font-size: 2.5rem; font-weight: 400; }
.offline-symbol i { position: absolute; right: 9px; bottom: 10px; width: 13px; height: 13px; border: 3px solid #f8faff; border-radius: 50%; background: #39a16a; }
.offline-copy h2 { max-width: 590px; margin: 0.4rem 0 0.5rem; color: #26334b; font-size: 1.55rem; letter-spacing: -0.035em; line-height: 1.22; }
.offline-copy p { max-width: 650px; margin: 0; color: #738095; font-size: 0.77rem; line-height: 1.65; }
.offline-status { min-width: 190px; padding: 0.8rem 0.9rem; border: 1px solid #e4eaf3; border-radius: 8px; background: #fff; color: #47556d; font-size: 0.67rem; font-weight: 700; line-height: 1.7; }
.offline-status > span { display: inline-block; width: 7px; height: 7px; margin-right: 0.32rem; border-radius: 50%; background: #d59a34; }
.offline-status small { padding-left: 0.85rem; color: #8792a3; font-size: 0.58rem; font-weight: 500; }

.audience-section { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 5rem; align-items: center; padding-block: 1rem 7rem; }
.audience-copy h2 { margin: 0.7rem 0 0.8rem; color: #1e2b43; font-size: clamp(2rem, 3.4vw, 2.7rem); letter-spacing: -0.045em; line-height: 1.13; }
.audience-copy p { margin: 0; color: #737f93; font-size: 0.88rem; line-height: 1.8; }
.audience-points { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
.audience-points > div { display: flex; align-items: flex-start; gap: 0.65rem; }
.audience-points > div > span { display: grid; place-items: center; width: 21px; height: 21px; flex: 0 0 auto; border-radius: 50%; background: #e9f5ee; color: #39845d; font-size: 0.68rem; font-weight: 900; }
.audience-points p { display: grid; gap: 0.3rem; margin: 0; }
.audience-points strong { color: #37445c; font-size: 0.76rem; }
.audience-points small { color: #828da0; font-size: 0.68rem; line-height: 1.55; }

.faq-section { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 5rem; padding-block: 5.2rem; border-top: 1px solid #edf0f4; }
.faq-heading h2 { font-size: 2.2rem; }
.faq-list details { padding: 1.05rem 0; border-bottom: 1px solid #e9ecf1; }
.faq-list summary { display: flex; justify-content: space-between; gap: 1rem; color: #344159; font-size: 0.84rem; font-weight: 700; cursor: pointer; list-style: none; }
.faq-list summary::-webkit-details-marker { display: none; }
.faq-list summary span { color: #4c68ce; font-size: 1.1rem; font-weight: 400; transition: transform 0.2s ease; }
.faq-list details[open] summary span { transform: rotate(45deg); }
.faq-list details p { margin: 0.7rem 2rem 0 0; color: #778397; font-size: 0.76rem; line-height: 1.75; }

.closing-section { padding-block: 1.5rem 5.5rem; }
.closing-card { position: relative; display: flex; min-height: 340px; align-items: center; overflow: hidden; padding: 3.2rem 4rem; border-radius: 17px; background: #1e2c4c; color: #fff; }
.closing-content { position: relative; z-index: 2; max-width: 620px; }
.closing-content h2 { margin: 0.55rem 0 0.7rem; color: #fff; font-size: clamp(2.1rem, 4vw, 3.15rem); letter-spacing: -0.05em; line-height: 1.08; }
.closing-content p { max-width: 535px; margin: 0; color: #c1ccdf; font-size: 0.84rem; line-height: 1.7; }
.button-cta { margin-top: 1.35rem; min-height: 47px; font-size: 0.8rem; }
.closing-content > small { display: block; margin-top: 0.72rem; color: #afbdd5; font-size: 0.65rem; }
.closing-orb { position: absolute; border: 1px solid #ffffff13; border-radius: 50%; }
.closing-orb-one { top: -150px; right: -55px; width: 520px; height: 520px; }
.closing-orb-two { top: -65px; right: 28px; width: 350px; height: 350px; }
.closing-mark { position: absolute; right: 12%; bottom: -7.3rem; color: #ffffff0b; font-size: 28rem; font-weight: 900; font-style: italic; line-height: 1; }

.site-footer { display: grid; grid-template-columns: 1fr 1fr auto; align-items: center; gap: 1rem; padding-block: 1.6rem 2rem; border-top: 1px solid #edf0f4; }
.footer-brand .brand-symbol { width: 31px; height: 31px; border-radius: 9px; font-size: 0.95rem; }
.footer-brand .brand-name { font-size: 0.78rem; }
.site-footer p { margin: 0; color: #7a8597; font-size: 0.72rem; }
.site-footer > a:not(.brand) { color: #59667b; font-size: 0.72rem; font-weight: 650; text-decoration: none; }
.site-footer > small { grid-column: 1 / -1; color: #9aa3b1; font-size: 0.65rem; }

@media (max-width: 960px) {
  .section-shell, .site-header, .value-strip-inner, .site-footer { width: min(100% - 44px, 760px); }
  .site-nav { gap: 1rem; }
  .hero { grid-template-columns: 1fr 1fr; gap: 1rem; min-height: 540px; padding-block: 3.5rem; }
  .hero h1 { font-size: clamp(2.4rem, 5vw, 3.4rem); }
  .hero-visual { min-height: 350px; }
  .pos-window { transform: none; }
  .floating-card-top { left: -1%; }.floating-card-bottom { right: -1%; }
  .benefit-grid { grid-template-columns: repeat(2, 1fr); }
  .benefit-card { min-height: 250px; }
  .features-layout { gap: 3rem; }
  .offline-card { grid-template-columns: 75px 1fr; }
  .offline-status { grid-column: 2; justify-self: start; }
  .audience-section, .faq-section { gap: 2.5rem; }
}

@media (max-width: 820px) {
  .hero { grid-template-columns: 1fr; gap: 1rem; }
  .hero-copy { max-width: 650px; }
  .hero-visual { width: min(100%, 620px); margin-inline: auto; }
  .floating-card-top { top: 0; }
  .floating-card-bottom { bottom: 0; }
}

@media (max-width: 680px) {
  .section-shell, .site-header, .value-strip-inner, .site-footer { width: calc(100% - 36px); }
  .site-header { min-height: 68px; gap: 0.6rem; }
  .brand { gap: 0.45rem; }
  .brand-symbol { width: 32px; height: 32px; border-radius: 10px; font-size: 1rem; }
  .brand-name { font-size: 0.77rem; }
  .brand-name > span { font-size: 0.63rem; }
  .site-nav { display: none; }
  .header-actions { gap: 0.7rem; }
  .login-link { font-size: 0.73rem; }
  .button-small { min-height: 36px; padding: 0.5rem 0.7rem; font-size: 0.7rem; }
  .hero { grid-template-columns: 1fr; gap: 1rem; min-height: unset; padding-block: 3rem 3.7rem; }
  .hero-copy { padding: 0; }
  .hero h1 { margin-top: 1.3rem; font-size: clamp(2.55rem, 11vw, 3.4rem); }
  .hero-description { font-size: 0.91rem; }
  .hero-actions { align-items: flex-start; flex-direction: column; gap: 1rem; }
  .hero-note { align-items: flex-start; font-size: 0.7rem; line-height: 1.5; }
  .hero-visual { min-height: 320px; margin-top: 1rem; }
  .visual-caption { top: -0.35rem; right: 0; font-size: 0.59rem; }
  .pos-window { width: 100%; border-radius: 10px; }
  .window-topbar { height: 47px; padding-inline: 0.6rem; }
  .window-body { grid-template-columns: 1fr 128px; gap: 0.5rem; padding: 0.65rem; }
  .window-title-row { align-items: flex-start; flex-direction: column; }
  .search-chip { display: none; }
  .mock-product { gap: 0.35rem; padding: 0.35rem; }
  .product-icon { width: 26px; height: 26px; }
  .mock-product-copy strong { max-width: 85px; font-size: 0.53rem; }
  .mock-product-copy small { font-size: 0.44rem; }
  .window-cart { min-height: 220px; padding-inline: 0.48rem; }
  .floating-card { gap: 0.4rem; padding: 0.5rem; }
  .floating-card-top { top: 4%; left: -2%; }
  .floating-card-bottom { right: -2%; bottom: 3%; }
  .floating-card strong { font-size: 0.55rem; }.floating-card small { font-size: 0.49rem; }
  .float-icon, .float-check { width: 25px; height: 25px; }
  .value-strip-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem 0.55rem; padding-block: 1rem; }
  .value-strip-inner > span { align-items: flex-start; font-size: 0.64rem; line-height: 1.4; }
  .benefits-section, .workflow-section { padding-block: 4.5rem; }
  .section-heading { margin-bottom: 2rem; text-align: left; }
  .section-heading h2, .faq-heading h2 { font-size: 2.1rem; }
  .section-heading > p { margin-inline: 0; font-size: 0.85rem; }
  .benefit-grid { grid-template-columns: 1fr; gap: 0.75rem; }
  .benefit-card { min-height: 220px; padding: 1.15rem; }
  .benefit-featured { min-height: 250px; }
  .features-layout { grid-template-columns: 1fr; gap: 2.4rem; padding-block: 4.5rem; }
  .features-intro h2 { font-size: 2.25rem; }
  .workflow-grid { grid-template-columns: 1fr 1fr; gap: 1.8rem 1rem; }
  .step-line { display: none; }
  .workflow-grid p { font-size: 0.73rem; }
  .offline-section { padding-bottom: 4.5rem; }
  .offline-card { grid-template-columns: 1fr; gap: 1rem; padding: 1.3rem; }
  .offline-symbol { width: 60px; height: 60px; border-radius: 18px; }
  .offline-symbol span { font-size: 2rem; }
  .offline-copy h2 { font-size: 1.4rem; }
  .offline-status { grid-column: auto; }
  .audience-section, .faq-section { grid-template-columns: 1fr; gap: 1.8rem; padding-block: 1rem 4.5rem; }
  .audience-copy h2 { font-size: 2.1rem; }
  .audience-points { gap: 1rem; }
  .audience-points strong { font-size: 0.7rem; }.audience-points small { font-size: 0.63rem; }
  .faq-section { padding-top: 3.8rem; }
  .faq-heading h2 { margin-bottom: 0; }
  .faq-list summary { font-size: 0.78rem; }
  .closing-section { padding-block: 0 3.5rem; }
  .closing-card { min-height: 370px; align-items: flex-start; padding: 2.2rem 1.35rem; border-radius: 13px; }
  .closing-content h2 { font-size: 2.25rem; }
  .closing-content p { font-size: 0.77rem; }
  .closing-mark { right: -2%; bottom: -3.2rem; font-size: 19rem; }
  .site-footer { grid-template-columns: 1fr auto; gap: 0.8rem; padding-block: 1.3rem 1.6rem; }
  .site-footer p { grid-column: 1 / -1; grid-row: 2; }
  .site-footer > a:not(.brand) { grid-column: 2; grid-row: 1; }
  .site-footer > small { grid-row: 3; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
}
</style>
