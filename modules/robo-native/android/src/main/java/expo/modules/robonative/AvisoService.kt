package expo.modules.robonative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// Fica vigiando o histórico do robô (mesmo com o app fechado) e avisa cada ordem que deu lucro.
class AvisoService : Service() {
  companion object {
    private const val SB = "https://fyxksvydxwvygjebanno.supabase.co/rest/v1/sinais_ordens"
    private const val CHAVE = "sb_publishable_HA-Ez2aumnGCLZt2rf-bsQ_MqipvpWK"
    private const val CODIGO = "rJAShHACX2c91d6HpYqypp_1"
    private const val CANAL_FIXO = "vigia"
    private const val CANAL_GANHO = "ganhos"
    private const val INTERVALO = 20_000L

    fun iniciar(ctx: Context) {
      val i = Intent(ctx, AvisoService::class.java)
      try {
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
      } catch (e: Exception) { /* Android não deixou agora; tenta na próxima abertura */ }
    }
  }

  private lateinit var fio: HandlerThread
  private lateinit var h: Handler
  private val prefs by lazy { getSharedPreferences("robosinais", Context.MODE_PRIVATE) }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    criarCanais()
    val fixo = NotificationCompat.Builder(this, CANAL_FIXO)
      .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
      .setContentTitle("Robô de Sinais")
      .setContentText("De olho nas ordens do robô")
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setContentIntent(abrirApp())
      .build()
    if (Build.VERSION.SDK_INT >= 34) startForeground(1, fixo, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    else startForeground(1, fixo)
    fio = HandlerThread("vigia").also { it.start() }
    h = Handler(fio.looper)
    h.post(object : Runnable {
      override fun run() {
        try { checar() } catch (e: Exception) { /* sem internet: tenta de novo */ }
        h.postDelayed(this, INTERVALO)
      }
    })
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_STICKY

  override fun onDestroy() {
    fio.quitSafely()
    super.onDestroy()
  }

  private fun criarCanais() {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel(CANAL_FIXO, "Vigia do robô", NotificationManager.IMPORTANCE_MIN).apply { setShowBadge(false) })
    nm.createNotificationChannel(NotificationChannel(CANAL_GANHO, "Ordens com lucro", NotificationManager.IMPORTANCE_HIGH))
  }

  private fun abrirApp(): PendingIntent? {
    val i = packageManager.getLaunchIntentForPackage(packageName) ?: return null
    return PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun iso(ms: Long): String {
    val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    f.timeZone = TimeZone.getTimeZone("UTC")
    return f.format(Date(ms))
  }

  private fun checar() {
    // na primeira vez só marca o ponto de partida (não avisa ordens antigas)
    var desde = prefs.getLong("avisoDesde", 0L)
    if (desde == 0L) { desde = System.currentTimeMillis(); prefs.edit().putLong("avisoDesde", desde).apply() }
    val avisadas = (prefs.getString("avisadas", "") ?: "").split('|').filter { it.isNotEmpty() }.toMutableList()

    // ordens com lucro atualizadas depois do ponto de partida
    val url = "$SB?select=id,ativo,dir,estrategia,resultado,conta,fechou_antes,atualizado_em" +
      "&resultado=gt.0&atualizado_em=gte." + URLEncoder.encode(iso(desde - 60_000), "UTF-8") +
      "&order=atualizado_em.asc&limit=50"
    val c = URL(url).openConnection() as HttpURLConnection
    c.connectTimeout = 10000
    c.readTimeout = 10000
    c.setRequestProperty("apikey", CHAVE)
    c.setRequestProperty("Authorization", "Bearer $CHAVE")
    c.setRequestProperty("x-codigo", CODIGO)
    if (c.responseCode !in 200..299) return
    val lista = JSONArray(c.inputStream.bufferedReader().use { it.readText() })

    for (k in 0 until lista.length()) {
      val o = lista.getJSONObject(k)
      val id = o.optString("id")
      if (id.isEmpty() || avisadas.contains(id)) continue
      avisadas.add(id)
      val v = o.optDouble("resultado", 0.0)
      val moeda = if (o.optString("conta") == "demo") "Đ " else "US$ "
      val dir = when (o.optString("dir")) { "up" -> "Compra"; "down" -> "Venda"; else -> "" }
      val titulo = "Lucro: +" + moeda + String.format(Locale("pt", "BR"), "%.2f", v)
      val texto = listOf(o.optString("ativo"), dir).filter { it.isNotEmpty() }.joinToString(" · ") +
        (if (o.optBoolean("fechou_antes")) " · fechou antes" else "") +
        (if (o.optString("estrategia").isNotEmpty()) "\n" + o.optString("estrategia") else "")
      val n: Notification = NotificationCompat.Builder(this, CANAL_GANHO)
        .setSmallIcon(android.R.drawable.arrow_up_float)
        .setContentTitle(titulo)
        .setContentText(texto.substringBefore('\n'))
        .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
        .setColor(0xFF2FC59C.toInt())
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setAutoCancel(true)
        .setContentIntent(abrirApp())
        .build()
      try { NotificationManagerCompat.from(this).notify(id.hashCode(), n) } catch (e: SecurityException) { /* sem permissão de notificação */ }
    }
    while (avisadas.size > 300) avisadas.removeAt(0)
    prefs.edit().putString("avisadas", avisadas.joinToString("|")).apply()
  }
}

// liga o vigia de novo quando o celular reinicia ou o app é atualizado
class AvisoBoot : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    if (ctx.getSharedPreferences("robosinais", Context.MODE_PRIVATE).getBoolean("avisosLigados", false)) AvisoService.iniciar(ctx)
  }
}
