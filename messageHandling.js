const fs = require("fs");
const axios = require("axios");
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


// Implementando una maquina de estados para datos temporales
const userState = {};

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

// Función para enviar la plantilla con imagen y captura de flujo
async function sendImageWithMessage(to, templateName, imageUrl) {
  return enviarPlantillaConImagen(to, templateName, imageUrl);
}

// Función para consultar la API por producto
async function buscarProductoPorNID(nid) {
  try {
    const response = await axios.get(`${url_base}/productos.php?nid=${Number(nid)}`);

    // 👇 Extraemos el producto dentro del array
    const producto = response.data.producto?.[0];

    console.log("Producto: ", producto);

    return producto;
  } catch (error) {
    console.error("❌ Error consultando API:", error);
    return { status: "error", mensaje: "Error de conexión con API" };
  }
}

async function confirmarCompraAPI(nid) {
  try {
    const payload = {
      compras: [
        { nid: Number(nid) }
      ]
    };

    const response = await axios.post(
      `${url_base}/compras.php`,
      payload,
      { headers: { "Content-Type": "application/json" } }
    );

    return response.data;

  } catch (error) {
    console.error("❌ Error confirmando compra:", error);
    return { status: "error", mensaje: "Error de conexión API" };
  }
}

async function obtenerCompraPorFolio(folio) {
  try {
    const response = await axios.get(`${url_base}/compras.php?folio=${Number(folio)}`);

    const compra = response.data;

    console.log("Información compra salida: ", compra);

    return compra;
  } catch (error) {
    console.error("❌ Error al obtener compra por folio:", error);
    return;
  }
}

async function handleIncomingMessage(payload) {

  // Log de la solicitud entrante para depuración
  fs.appendFileSync(
    "debug_post_log.txt",
    `${new Date().toISOString()} - POST Request: ${JSON.stringify(payload)}\n`
  );

  // 👉 Ignorar notificaciones de estado (confirmaciones de WhatsApp)
  const change = payload.entry?.[0]?.changes?.[0];
  if (change?.value?.statuses && !change?.value?.messages) {
    return;
  }

  // Procesar mensajes reales
  const message = change?.value?.messages?.[0];

  if (!message) {
    console.log("Payload sin mensajes válidos");
    return;
  }
  console.log("\ud83d\udce9 Mensaje recibido:", message);

  const from = message.from;

  // Flujo definido según el tipo ("text" o "button")
  if (message.type === "text") {
    // Aqui se programar las palabras claves
    const body = message.text?.body?.toLowerCase() || "";
    if (body.includes("hola")) {
      await sendTemplateMessage(from, "menu_inicio");
      return;
    }

    // Detectar NID como segunda prioridad
    if (body.startsWith("nid:")) {
      const nid = Number(body.replace("nid:", "").trim());

      const producto = await buscarProductoPorNID(nid);

      console.log("Valor regresado - ", producto);

      if (!producto) {
        await sendTextMessage(from, "❌ Producto no encontrado.");
        return;
      }

      // GUARDAMOS EL NID PARA LA CONFIRMACIÓN
      userState[from] = { nid_pendiente: nid };

      await sendTemplateMessageV2(
        from,
        "confirmar_compra",
        [
          String(nid),
          String(producto.nombre),
          String(producto.marca),
          String(producto.precio)
        ]
      );

      return;
    }

    // Detectar Folio como tercera prioridad
    if (body.startsWith("folio:")) {
      const folio = Number(body.replace("folio:", "").trim());

      // Realizamos la consulta de la compra a la API
      const info = await obtenerCompraPorFolio(folio);

      const compra = info.compras?.[0];

      if (!compra) {
        await sendTemplateMessage(from, "pedido_no_encontrado");
        return;
      }

      // Se envian los datos junto al folio
      await sendTemplateMessageV2(
        from,
        "pedido_encontrado",
        [
          String(compra.folio),
          String(compra.nid),
          String(compra.nombre),
          String(compra.marca),
          String(compra.precio)]
      );

      return;
    }

    // Aqui se programan los botones
  } else if (message.type === "button" && message.button?.payload) {
    const btnPayload = message.button.payload
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""); // Elimina acentos

    if (btnPayload === "ver el catalogo") {
      await sendImageWithMessage(
        from,
        "ver_catalogo",
        imageUrl
      );
    } else if (btnPayload === "comprar") {
      await sendTemplateMessage(from, "comprar_productos");
    } else if (btnPayload === "regresar a inicio" || btnPayload === "regresar al inicio") {
      await sendTemplateMessage(from, "menu_inicio");
    } else if (btnPayload === "si") {

      // Utilización de la maquina de estado
      const nid = userState[from]?.nid_pendiente;

      if (!nid) {
        await sendTextMessage(from, "No hay ninguna compra pendiente.");
        return;
      }

      // LLAMADA A LA API PARA CONFIRMAR
      const resultado = await confirmarCompraAPI(nid);

      console.log("Resultado de la compra: ", resultado);

      if (!resultado.folio) {
        await sendTextMessage(from, "❌ No se pudo completar tu compra.");
        return;
      }

      // Realizamos la consulta de la compra a la API
      const info = await obtenerCompraPorFolio(resultado.folio);

      const compra = info.compras?.[0];

      if (!compra) {
        await sendTextMessage(from, "⚠️ No se pudo obtener los datos completos de la compra.");
        return;
      }

      // Se envian los datos junto al folio
      await sendTemplateMessageV2(
        from,
        "compra_confirma",
        [
          String(compra.folio),
          String(compra.nid),
          String(compra.nombre),
          String(compra.marca),
          String(compra.precio),
          String(compra.pago)]
      );

      // BORRAMOS EL ESTADO
      delete userState[from];

      return;
    } else if (btnPayload === "no") {
      await sendTemplateMessage(from, "comprar_productos");
    } else if (btnPayload === "eso es todo, gracias") {
      await sendTemplateMessage(from, "mensaje_salida");
    } else if (btnPayload === "buscar compra") {
      await sendTemplateMessage(from, "buscar_pedido")
    }
  }
}


module.exports = handleIncomingMessage;
