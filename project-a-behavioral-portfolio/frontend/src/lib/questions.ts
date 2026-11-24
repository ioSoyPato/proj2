// Wording of the 10 questions. Option VALUES come from the backend (/api/meta);
// this file only holds the bilingual text.
type T = { en: string; es: string };

export const QUESTION_TEXT: Record<string, { text: T; help: T; options?: T[] }> = {
  q1: {
    text: { en: "A coin flip pays you $1,000 on heads and nothing on tails. What is the smallest sure amount you would take instead of flipping?", es: "Un volado te paga $1,000 si sale águila y nada si sale sol. ¿Cuál es la menor cantidad segura que aceptarías en lugar de lanzar la moneda?" },
    help: { en: "Below $500 means you prefer certainty when you are winning.", es: "Menos de $500 significa que prefieres lo seguro cuando vas ganando." },
  },
  q2: {
    text: { en: "Same coin flip, but the prize is $10,000. Smallest sure amount you would take?", es: "El mismo volado, pero el premio es de $10,000. ¿Menor cantidad segura que aceptarías?" },
    help: { en: "A second stake checks that your answer is not tied to one amount.", es: "Un segundo monto verifica que tu respuesta no dependa de una sola cantidad." },
  },
  q3: {
    text: { en: "A coin flip makes you lose $1,000 on tails and nothing on heads. What is the largest sure loss you would accept to skip the flip?", es: "Un volado te hace perder $1,000 si sale sol y nada si sale águila. ¿Cuál es la mayor pérdida segura que aceptarías para no lanzar?" },
    help: { en: "Below $500 means you would rather gamble than lock in a loss.", es: "Menos de $500 significa que prefieres apostar antes que asegurar una pérdida." },
  },
  q4: {
    text: { en: "Same flip, but you could lose $10,000. Largest sure loss you would accept instead?", es: "El mismo volado, pero podrías perder $10,000. ¿Mayor pérdida segura que aceptarías?" },
    help: { en: "Again, a second stake for the loss side.", es: "De nuevo, un segundo monto para el lado de las pérdidas." },
  },
  q5: {
    text: { en: "Heads you win $G, tails you lose $1,000. What is the smallest G that would make you accept this bet?", es: "Águila ganas $G, sol pierdes $1,000. ¿Cuál es la menor G con la que aceptarías esta apuesta?" },
    help: { en: "The ratio G / 1,000 is the core of your loss aversion.", es: "La razón G / 1,000 es el núcleo de tu aversión a pérdidas." },
  },
  q6: {
    text: { en: "Heads you win $G, tails you lose $10,000. Smallest G that makes you accept?", es: "Águila ganas $G, sol pierdes $10,000. ¿Menor G con la que aceptarías?" },
    help: { en: "Larger stakes often raise the bar; we average both answers.", es: "Montos mayores suelen subir la exigencia; promediamos ambas respuestas." },
  },
  q7: {
    text: { en: "Your portfolio fell 20% in three months. What do you do?", es: "Tu portafolio cayó 20% en tres meses. ¿Qué haces?" },
    help: { en: "Sets the drawdown d at which the simulated you sells everything.", es: "Define la caída d a la que el tú simulado vende todo." },
    options: [
      { en: "Sell everything", es: "Vendo todo" },
      { en: "Sell about half", es: "Vendo como la mitad" },
      { en: "Hold and wait", es: "Mantengo y espero" },
      { en: "Buy more", es: "Compro más" },
    ],
  },
  q8: {
    text: { en: "Suppose you did sell. How much would the market need to bounce back before you buy in again?", es: "Supón que sí vendiste. ¿Cuánto tendría que rebotar el mercado antes de volver a comprar?" },
    help: { en: "Sets the recovery r measured from the lowest point after you sold.", es: "Define la recuperación r medida desde el punto más bajo después de vender." },
    options: [
      { en: "5%: I'd jump back quickly", es: "5%: regreso rápido" },
      { en: "10%", es: "10%" },
      { en: "20%: I want proof", es: "20%: quiero pruebas" },
      { en: "30%: only when it feels safe", es: "30%: sólo cuando se sienta seguro" },
    ],
  },
  q9: {
    text: { en: "A fund you don't own rose 40% last year; yours rose 8%. What do you do?", es: "Un fondo que no tienes subió 40% el año pasado; el tuyo subió 8%. ¿Qué haces?" },
    help: { en: "Sets k, the share of the portfolio moved into last year's winners.", es: "Define k, la fracción del portafolio que se mueve a los ganadores del último año." },
    options: [
      { en: "Nothing", es: "Nada" },
      { en: "Move a quarter", es: "Muevo una cuarta parte" },
      { en: "Move half", es: "Muevo la mitad" },
      { en: "Move most of it", es: "Muevo casi todo" },
    ],
  },
  q10: {
    text: { en: "How often do you look at your portfolio and act on what you see?", es: "¿Cada cuánto revisas tu portafolio y actúas según lo que ves?" },
    help: { en: "Sets f, how often the chasing happens.", es: "Define f, cada cuánto ocurre la persecución de rendimientos." },
    options: [
      { en: "Every month", es: "Cada mes" },
      { en: "Every quarter", es: "Cada trimestre" },
      { en: "Twice a year", es: "Dos veces al año" },
      { en: "Once a year", es: "Una vez al año" },
    ],
  },
};

export const BLOCK_TITLE: Record<string, T> = {
  alpha: { en: "When you are winning", es: "Cuando vas ganando" },
  beta: { en: "When you are losing", es: "Cuando vas perdiendo" },
  lambda: { en: "Mixed bets", es: "Apuestas mixtas" },
  bias: { en: "What you would actually do", es: "Lo que realmente harías" },
};
