export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const message = String(body?.message || "").trim();
    const uiContext = body?.context || null;

    if (!message) {
      return Response.json(
        { answer: "Je n’ai pas reçu de question." },
        { status: 400 }
      );
    }

    const systemPrompt = `
Tu es l'assistant officiel de CityTaste.
Tu aides les utilisateurs à comprendre le site CityTaste et à trouver des restaurants et hébergements à Ottawa.
Réponds en français si l'utilisateur écrit en français.
Réponds en anglais si l'utilisateur écrit en anglais.
Sois poli, clair, simple et utile.
Reste centré sur CityTaste, Ottawa, les filtres, la localisation, les résultats, les restaurants et les hébergements.
Si la question sort du sujet, réponds gentiment que tu peux surtout aider avec CityTaste.
N'invente pas des lieux précis si tu n'en es pas certain.
Si un contexte d'interface est fourni, utilise-le pour mieux répondre.
`.trim();

    const userContent = uiContext
      ? `Question utilisateur: ${message}\n\nContexte interface: ${JSON.stringify(uiContext)}`
      : message;

    const result = await env.AI.run("@cf/google/gemma-3-12b-it", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    });

    const answer =
      result?.response ||
      result?.result?.response ||
      result?.text ||
      "Désolé, je n’ai pas pu générer une réponse pour le moment.";

    return Response.json({ answer });
  } catch (error) {
    return Response.json(
      {
        answer:
          "Désolé, le service de l’assistant est temporairement indisponible."
      },
      { status: 200 }
    );
  }
}