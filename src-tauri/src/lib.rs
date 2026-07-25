use std::time::Duration;
use serialport;

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

#[tauri::command]
fn print_receipt(
    port_name: Option<String>,
    receipt_data: &str,
    open_drawer: Option<bool>,
    print_logo: Option<bool>,
    logo_kc1: Option<u8>,
    logo_kc2: Option<u8>,
    logo_scale: Option<u8>,
) -> Result<String, String> {
    if let Some(name) = port_name {
        if name == "SIMULATOR" || name.is_empty() {
            println!("=== SIMULANDO IMPRESORA TÉRMICA ===");
            if print_logo.unwrap_or(false) {
                println!("[LOGO NV kc1={} kc2={}]", logo_kc1.unwrap_or(32), logo_kc2.unwrap_or(32));
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

        // 2.5. Logo guardado en memoria NV de la impresora (GS ( L, función 69 "Print NV
        // graphics data"). Como imprimimos mandando bytes crudos al puerto en vez de pasar
        // por el driver de Windows, las Printing Preferences de Windows no aplican — el logo
        // debe invocarse aquí, con el key code (kc1/kc2) con el que ya se grabó en la
        // impresora vía la utilidad NV Logo de Epson. Va antes del encabezado del ticket.
        if print_logo.unwrap_or(false) {
            let kc1 = logo_kc1.unwrap_or(32);
            let kc2 = logo_kc2.unwrap_or(32);
            let scale = logo_scale.unwrap_or(1).clamp(1, 4);
            let logo_cmd = [0x1D, 0x28, 0x4C, 0x05, 0x00, 0x30, 0x45, scale, kc1, kc2];
            port.write_all(&logo_cmd).map_err(|e| e.to_string())?;
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
