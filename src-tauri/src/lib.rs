use std::time::Duration;
use serialport;
use base64::Engine;
use image::GenericImageView;

#[tauri::command]
fn list_ports() -> Vec<String> {
    match serialport::available_ports() {
        Ok(ports) => ports.iter().map(|p| p.port_name.clone()).collect(),
        Err(_) => vec![],
    }
}

#[tauri::command]
fn open_cash_drawer(port_name: Option<String>) -> Result<String, String> {
    if let Some(name) = port_name {
        if name == "SIMULATOR" || name.is_empty() {
             println!("Simulando apertura de cajón (RJ11)");
             return Ok("Cajón abierto (Simulando)".into());
        }
        
        let mut port = serialport::new(name, 9600)
            .timeout(Duration::from_millis(1000))
            .open()
            .map_err(|e| format!("Error abriendo puerto: {}", e))?;
            
        // Comando EPSON ESC/POS para abrir cajón: ESC p m t1 t2
        let open_command = [0x1B, 0x70, 0x00, 0x19, 0xFA];
        port.write_all(&open_command).map_err(|e| e.to_string())?;
        Ok("Comando de cajón enviado".into())
    } else {
        println!("No hay puerto configurado para el cajón.");
        Ok("Puerto no configurado".into())
    }
}

// Convierte texto UTF-8 a bytes WPC1252 (Windows-1252), que es la tabla de códigos
// que seleccionamos en la impresora vía ESC t 16. Para el rango 0x00-0xFF, Windows-1252
// es idéntico a Unicode/ISO-8859-1 byte a byte, así que la conversión es directa y no
// requiere una tabla de mapeo (evita errores de transcripción manual). Cualquier carácter
// fuera de ese rango (emojis, etc.) cae a '?' en vez de corromper el resto del ticket.
fn to_wpc1252(s: &str) -> Vec<u8> {
    s.chars()
        .map(|c| {
            let cp = c as u32;
            if cp <= 0xFF { cp as u8 } else { b'?' }
        })
        .collect()
}

// Decodifica un data URI (data:image/png;base64,....) y lo convierte al formato que espera
// GS v 0 ("Print raster bit image"): escala de grises con umbral simple a monocromo (1 bit
// por punto, MSB primero, bit=1 imprime negro), redimensionado a `target_width_dots` de
// ancho preservando proporción. Se manda la imagen tal cual en cada ticket en vez de
// depender de un logo grabado en la memoria NV de la impresora, porque no hay forma de
// verificar desde el software que ese logo NV exista de verdad (ver GS(L intentado antes:
// ninguna combinación de key code encontró nada grabado).
fn render_logo_escpos(data_uri: &str, target_width_dots: u32) -> Result<Vec<u8>, String> {
    let b64 = data_uri.split(',').nth(1).ok_or("Data URI de logo inválido")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("No se pudo decodificar el logo: {}", e))?;
    let img = image::load_from_memory(&bytes).map_err(|e| format!("No se pudo leer la imagen del logo: {}", e))?;

    let target_width = target_width_dots.clamp(64, 576);
    let (orig_w, orig_h) = img.dimensions();
    let target_height = ((orig_h as u64 * target_width as u64) / orig_w as u64).max(1) as u32;
    let resized = img.resize_exact(target_width, target_height, image::imageops::FilterType::Lanczos3);
    let gray = resized.to_luma8();

    let width = gray.width();
    let height = gray.height();
    let bytes_per_row = ((width + 7) / 8) as usize;
    let mut raster = vec![0u8; bytes_per_row * height as usize];

    for y in 0..height {
        for x in 0..width {
            let lum = gray.get_pixel(x, y).0[0];
            if lum < 128 {
                let row_start = y as usize * bytes_per_row;
                raster[row_start + (x / 8) as usize] |= 0x80 >> (x % 8);
            }
        }
    }

    let x_l = (bytes_per_row & 0xFF) as u8;
    let x_h = ((bytes_per_row >> 8) & 0xFF) as u8;
    let y_l = (height & 0xFF) as u8;
    let y_h = ((height >> 8) & 0xFF) as u8;

    let mut cmd = vec![0x1D, 0x76, 0x30, 0x00, x_l, x_h, y_l, y_h];
    cmd.extend_from_slice(&raster);
    Ok(cmd)
}

#[tauri::command]
fn print_receipt(
    port_name: Option<String>,
    receipt_data: &str,
    open_drawer: Option<bool>,
    logo_data_uri: Option<String>,
    logo_width_dots: Option<u32>,
) -> Result<String, String> {
    if let Some(name) = port_name {
        if name == "SIMULATOR" || name.is_empty() {
            println!("=== SIMULANDO IMPRESORA TÉRMICA ===");
            if let Some(uri) = &logo_data_uri {
                if !uri.is_empty() {
                    println!("[LOGO: {} bytes de imagen a imprimir como bitmap]", uri.len());
                }
            }
            println!("{}", receipt_data);
            if open_drawer.unwrap_or(false) {
                println!("Simulando apertura de cajón junto con la impresión");
            }
            return Ok("Impresión simulada exitosa".into());
        }

        let mut port = serialport::new(name, 9600)
            .timeout(Duration::from_millis(2000))
            .open()
            .map_err(|e| format!("Error abriendo puerto de impresora: {}", e))?;

        // 1. Inicializar impresora
        let init_cmd = [0x1B, 0x40];
        port.write_all(&init_cmd).map_err(|e| e.to_string())?;

        // 2. Seleccionar tabla de códigos WPC1252 (Windows-1252) para que acentos y "ñ"
        // impriman correctamente (antes se mandaba UTF-8 crudo y salía corrupto).
        let select_codepage_cmd = [0x1B, 0x74, 0x10];
        port.write_all(&select_codepage_cmd).map_err(|e| e.to_string())?;

        // 2.5. Logo del negocio, mandado como bitmap (GS v 0) antes del encabezado del
        // ticket. Un error aquí (imagen corrupta, data URI mal formado) NUNCA debe impedir
        // que el resto del ticket se imprima — el logo es cosmético, la venta no.
        if let Some(uri) = &logo_data_uri {
            if !uri.is_empty() {
                match render_logo_escpos(uri, logo_width_dots.unwrap_or(300)) {
                    Ok(logo_cmd) => {
                        port.write_all(&logo_cmd).map_err(|e| e.to_string())?;
                    }
                    Err(e) => eprintln!("No se pudo renderizar el logo, se omite: {}", e),
                }
            }
        }

        // 3. Enviar datos del recibo, convertidos a WPC1252
        port.write_all(&to_wpc1252(receipt_data)).map_err(|e| e.to_string())?;

        // 4. Abrir el cajón (si se pidió) en la MISMA conexión que la impresión, en vez de
        // hacer una llamada aparte a open_cash_drawer que reabre el puerto justo después de
        // que print_receipt lo cerró — eso es lo que fallaba: el puerto (sobre todo por USB,
        // vía el driver de puerto virtual de Epson) no siempre se libera a tiempo para la
        // segunda apertura en Windows.
        if open_drawer.unwrap_or(false) {
            let open_command = [0x1B, 0x70, 0x00, 0x19, 0xFA];
            port.write_all(&open_command).map_err(|e| e.to_string())?;
        }

        // 5. Comando de Corte de papel (GS V 0)
        let cut_cmd = [0x1D, 0x56, 0x00];
        port.write_all(&cut_cmd).map_err(|e| e.to_string())?;

        Ok("Impresión física completada".into())
    } else {
        Err("Impresora no configurada en ajustes".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![list_ports, open_cash_drawer, print_receipt])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
