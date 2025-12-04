const fs = require("fs");
const path = require("path");
const {
  templates,
  enviarPlantillaSimple,
  enviarPlantillaConImagen,
  enviarPlantillaWhatsApp,
  enviarPlantillaWhatsAppV2,
  enviarPlantillaErrorGenerico,
  enviarMensajeTexto,
} = require("./whatsappTemplates");


// Armado de la ruta del recurso Catálogo
const url_base = process.env.URL_BASE_DB;
const loc_image = process.env.LOC_CATALOGO;
const imageUrl = `${url_base}/${loc_image}`;

// Aliases para mayor claridad
const sendTemplateMessage = enviarPlantillaWhatsApp;
const sendTemplateMessageV2 = enviarPlantillaWhatsAppV2;
const sendTextMessage = enviarMensajeTexto;

async function enviarPlantillaDesdeAPI({ from, url, templateName }) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    let items = [];
    if (data.menu) {
      items = data.menu.map((e) => `${e.nombre} - $${e.precio}`);
    } else if (data.ofertas) {
      items = data.ofertas.map((e) => e.descripcion);
    }
    const textoFinal = items.join("\n");

    const logsDir = path.join(__dirname, "logs");
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const logEntry =
      new Date().toISOString() +
      " - Respuesta API " +
      templateName +
      ": " +
      JSON.stringify(data) +
      "\n";
    fs.appendFileSync(path.join(logsDir, "api_log.txt"), logEntry);

    if (textoFinal) {
      await sendTemplateMessage(from, templateName, textoFinal);
    } else {
      await sendTextMessage(from, "No se pudo cargar el contenido.");
    }
  } catch (error) {
    const logsDir = path.join(__dirname, "logs");
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const logEntry =
      new Date().toISOString() +
      " - Error API " +
      templateName +
      ": " +
      error.message +
      "\n";
    fs.appendFileSync(path.join(logsDir, "api_log.txt"), logEntry);
    await sendTextMessage(from, "No se pudo cargar el contenido.");
  }
}

async function handleIncomingMessage(payload) {
  // Log de la solicitud entrante para depuración
  fs.appendFileSync(
    "debug_post_log.txt",
    `${new Date().toISOString()} - POST Request: ${JSON.stringify(payload)}\n`
  );

  // Validación básica de la estructura del payload
  const firstEntry = payload.entry?.[0];
  const firstChange = firstEntry?.changes?.[0];
  const firstMessage = firstChange?.value?.messages?.[0];

  if (!firstMessage) {
    console.log("Payload sin mensajes válidos");
    return;
  }

  const message = firstMessage;
  console.log("\ud83d\udce9 Mensaje recibido:", message);

  if (!message.type) return;

  const from = message.from;

  // Flujo definido según el tipo ("text" o "button")
  if (message.type === "text") {
    const body = message.text?.body?.toLowerCase() || "";
    if (body.includes("hola")) {
      await sendTemplateMessage(from, "menu_inicio");
    }
  } else if (message.type === "button" && message.button?.payload) {
    const btnPayload = message.button.payload.toLowerCase();
    if (btnPayload === "ver menu de hoy") {
      await enviarPlantillaDesdeAPI({
        url: "https://grp-ia.com/bitacora-residentes/menu.php",
        templateName: "menu_hoy",
        from,
      });
    } else if (btnPayload === "ver ofertas del dia") {
      await enviarPlantillaDesdeAPI({
        url: "https://grp-ia.com/bitacora-residentes/ofertas.php",
        templateName: "ofertas_dia",
        from,
      });
    } else if (btnPayload === "salir") {
      await sendTextMessage(from, "¡Gracias por visitarnos!");
    }
  }
}


module.exports = handleIncomingMessage;
