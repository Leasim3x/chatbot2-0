const axios = require("axios");
const fs = require("fs");

const templates = {
  HELLO_WORLD: "hello_world",
  MENU_INICIO: "menu_inicio",
  CATALOGO: "catalogo",
  COMPRAR_PRODUCTO: "comprar_producto",
  CONFIRMAR_COMPRA: "confirmar_compra",
  COMPRA_CONFIRMA: "compra_confirma", // Revisión 03-12-25
  BUSCAR_PEDIDO: "buscar_pedido",
  PEDIDO_ENCONTRADO: "pedido_encontrado",
  PEDIDO_NO_ENCONTRADO: "pedido_no_encontrado",
  MENSAJE_SALIDA: "mensaje_salida"
};

// Utilidad para limpiar texto y asegurar longitud
function sanitize(text) {
  const cleaned = text.replace(/[\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return cleaned.slice(0, 1024);
}


// Token de acceso generado en la consola de Meta
const accessToken = process.env.API_KEY;
const phoneNumberId = process.env.PHONE_NUMBER_ID;
const version = process.env.VERSION;

// Función para limpiar y validar el número
function procesarNumero(to) {
  if (!to) throw new Error("Número de destinatario no válido");
  return to.startsWith("521") ? to.replace(/^521/, "52") : to;
}
 
// Función genérica para construir y enviar payloads
async function enviarPayload(to, templateName, components = []) {
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  to = procesarNumero(to);

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: "es_MX" }, // Configuración del lenguaje de la plantilla
      components,
    },
  };

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  try {
    const response = await axios.post(url, payload, { headers });
    logExitoso(payload, response.data);
  } catch (error) {
    logError(payload, error);
  }
}

// Funciones específicas
async function enviarPlantillaWhatsApp(to, templateName, text = "") {
  const components = text
    ? [
        {
          type: "body",
          parameters: [{ type: "text", text: sanitize(text) }],
        },
      ]
    : [];
  await enviarPayload(to, templateName, components);
}

// Mapeo de la plantilla Error Generico
async function enviarPlantillaErrorGenerico(to, errorMessage) {
  const components = [
    {
      type: "body",
      parameters: [{ type: "text", text: errorMessage }],
    },
  ];
  await enviarPayload(to, templates.ERROR_GENERICO, components);
}

// Envia mensaje estándar, no plantillas
async function enviarMensajeTexto(to, text) {
  const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: procesarNumero(to),
    type: "text",
    text: { body: text },
  };

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  try {
    const response = await axios.post(url, payload, { headers });
    logExitoso(payload, response.data);
  } catch (error) {
    logError(payload, error);
  }
}

// Funciones auxiliares para logging
function logExitoso(payload, responseData) {
  const logMessage = `${new Date().toISOString()} - Enviado: ${JSON.stringify(payload)}\nRespuesta: ${JSON.stringify(responseData)}\n`;
  fs.appendFileSync("template_log.txt", logMessage);
  console.log("Plantilla enviada exitosamente:", responseData);
}

function logError(payload, error) {
  const errorData = error.response?.data || error.message;
  const logMessage = `${new Date().toISOString()} - Error enviando: ${JSON.stringify(payload)}\nError: ${JSON.stringify(errorData)}\n`;
  fs.appendFileSync("template_log.txt", logMessage);
  console.error("Error enviando plantilla:", errorData);
}

module.exports = {
  templates,
  enviarPlantillaWhatsApp,
  enviarPlantillaErrorGenerico,
  enviarMensajeTexto,
};
