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

#[tauri::command]
fn print_receipt(port_name: Option<String>, receipt_data: &str) -> Result<String, String> {
    if let Some(name) = port_name {
        if name == "SIMULATOR" || name.is_empty() {
            println!("=== SIMULANDO IMPRESORA TÉRMICA ===");
            println!("{}", receipt_data);
            return Ok("Impresión simulada exitosa".into());
        }

        let mut port = serialport::new(name, 9600)
            .timeout(Duration::from_millis(2000))
            .open()
            .map_err(|e| format!("Error abriendo puerto de impresora: {}", e))?;

        // 1. Inicializar impresora
        let init_cmd = [0x1B, 0x40];
        port.write_all(&init_cmd).map_err(|e| e.to_string())?;

        // 2. Enviar datos del recibo (convertidos a bytes)
        // Nota: Epson T88v usa CP437 o ISO-8859-1 para acentos.
        port.write_all(receipt_data.as_bytes()).map_err(|e| e.to_string())?;

        // 3. Comando de Corte de papel (GS V 0)
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
