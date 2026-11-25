# LOOKin

Controle sus aparatos infrarrojos desde Gladys con un mando universal
[LOOKin Remote2](https://look-in.club), en la red local: TV, reproductores
multimedia, luces, ventiladores, purificadores y aires acondicionados guardados
en la aplicación LOOKin, además de la temperatura y la humedad de su sensor.
Sin cuenta ni nube: Gladys habla directamente con la LOOKin, por su Wi-Fi.

> **Desarrollada sin el hardware: sus comentarios son bienvenidos.** Esta
> integración se ha construido y probado con las respuestas de la API local de
> LOOKin registradas por el proyecto aiolookin, y con una LOOKin simulada, no
> con una real. Si algo no funciona como se describe, dígalo en el
> [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-lookin/issues).

## Lo que necesita

- Gladys Assistant 5.2.0 o posterior.
- Una LOOKin Remote2 configurada en la **aplicación LOOKin**, en la misma red
  que Gladys.
- Sus aparatos guardados como mandos en la aplicación LOOKin (ahí se aprenden o
  eligen los códigos infrarrojos).
- Nada más: ni cuenta, ni clave, ni acceso a Internet.

## Instalación

1. Instale la integración desde el catálogo de Gladys.
2. Abra su **Configuración**. Nada es obligatorio; las opciones son:
   - **Direcciones IP de las LOOKin Remote**: solo si el descubrimiento
     automático no encuentra alguna (otra red, mDNS bloqueado). Asígnele una
     dirección fija en su router.
   - **Intervalo de actualización**: frecuencia de lectura de cada LOOKin (30
     segundos por defecto).
   - **Idioma de los nombres de los dispositivos**: nombres de los nuevos
     dispositivos y funciones.
3. Abra la pestaña **Descubrir**: aparecen la LOOKin y cada mando guardado en
   la aplicación LOOKin. Añada los que quiera.
4. La acción **Buscar LOOKin Remote** de la pantalla de configuración las busca
   de nuevo e indica lo encontrado.

## Los dispositivos en Gladys

**La propia LOOKin** (Remote2): **Temperatura** y **Humedad** de su sensor.

**Un dispositivo por mando** guardado en la aplicación LOOKin, con el nombre de
la aplicación:

| Mando                                                           | Funciones                                                                                                                        |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| TV, Multimedia                                                  | **Encendido/apagado**, pulsadores: **Subir volumen**, Bajar volumen, Silencio, Canal siguiente, Canal anterior, **Fuente**, Menú |
| Luz, Ventilador, Humidificador, Purificador de aire, Aspiradora | **Encendido/apagado** y un pulsador por cada otro botón (Velocidad, Oscilación, Modo…)                                           |
| Aire acondicionado (protocolo «AC» de LOOKin)                   | **Encendido/apagado**, **Modo**, **Temperatura objetivo** (16 a 30 °C), **Velocidad del ventilador**, **Oscilación**             |

Solo se crean los botones que el mando tiene en la aplicación LOOKin.

- El infrarrojo va en un solo sentido: la LOOKin no puede leer el aparato. El
  estado encendido/apagado es el que recuerda la LOOKin, según sus propios
  comandos y las pulsaciones del mando original que oye.
- Con botones «encender» y «apagar» separados, cada uno se envía según lo
  pedido. Con un solo botón de encendido, solo se pulsa si el estado conocido
  por la LOOKin es distinto.
- Aire acondicionado: todo el estado se envía de una vez, como el mando
  original. Elegir un modo enciende el aparato; la temperatura, el ventilador y
  la oscilación de un aparato apagado se guardan para cuando se encienda, en su
  último modo.

## Widget del panel

El widget **Mando LOOKin** pone un mando en el panel: su estado, la
temperatura de la estancia medida por la LOOKin y hasta cuatro botones elegidos
en su configuración entre los del mando (encendido, volumen, silencio, canal,
modo, menú, velocidad, oscilación; para un aire acondicionado: encendido y
consigna −1 / +1 °C).

## Escenas

### Acción: pulsar un botón

**Pulsar un botón de un mando LOOKin** envía un botón de un mando guardado en
la aplicación LOOKin: encendido/apagado (alternar), encender, apagar, modo o
fuente, silencio, volumen, canal, oscilación, velocidad, cursor, menú. Útil
para los botones sin función propia, o para encadenar varias pulsaciones.

### Acción: enviar un código IR

**Enviar un código IR con LOOKin** envía un código en bruto (duraciones en
microsegundos, `9000 -4500 560 -560 …`) o un código Pronto HEX
(`0000 006D 0022 0002 …`) a través de una LOOKin, para un aparato sin mando
guardado. Elija la LOOKin o uno de sus mandos.

### Ideas de escenas

- Al atardecer, apagar el ventilador y encender la luz.
- Cuando la temperatura de la LOOKin supere 27 °C, poner el aire acondicionado
  en frío a 24 °C.
- Al salir de casa, apagar la TV (botón apagar o el de alternar).

Una acción que falla (LOOKin que no responde, botón ausente, código no válido)
se detiene con un mensaje en rojo.

## Solución de problemas

- **No se encuentra ninguna LOOKin**: compruebe que está en la misma red que
  Gladys y luego introduzca su dirección IP en la configuración. El
  descubrimiento automático usa el descubrimiento de red de Gladys 5.2 (mDNS y
  puerto UDP 61201).
- **Falta un mando**: guárdelo primero en la aplicación LOOKin; aparece en la
  siguiente actualización.
- **El estado es incorrecto**: el aparato se accionó con un mando que la LOOKin
  no oyó. Con botones de encender y apagar separados, envíe de nuevo el estado
  desde Gladys; con un solo botón de encendido, accione el aparato fuera del
  alcance de la LOOKin para que ambos coincidan.

## Límites

- La LOOKin anuncia sus cambios por difusión UDP, que no llega al contenedor de
  la integración: se leen en cada intervalo de actualización.
- No se aprenden códigos nuevos: apréndalos o elíjalos en la aplicación LOOKin.
- Temperaturas del aire acondicionado en °C, de 16 a 30, como el protocolo
  LOOKin.
- Sin relación con LOOKin.
