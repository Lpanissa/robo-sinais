package expo.modules.robonative

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

// Atualização dentro do próprio app: descobre versão nova, baixa e abre o instalador do Android.
object Updater {
  private const val BASE = "https://edith.lpanissa.workers.dev/robosinais"

  private fun p(ctx: Context) = ctx.getSharedPreferences("robosinais", Context.MODE_PRIVATE)

  fun definirVersao(ctx: Context, sha: String) { p(ctx).edit().putString("sha", sha).apply() }

  // devolve {"sha": versão nova ou "", "notas": novidades} em texto JSON
  fun verificar(ctx: Context): String {
    val meu = p(ctx).getString("sha", "") ?: ""
    return try {
      val c = URL("$BASE/update").openConnection() as HttpURLConnection
      c.connectTimeout = 8000
      c.readTimeout = 8000
      val j = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
      val sha = j.optString("sha")
      val nova = if (meu.isNotEmpty() && meu != "dev" && sha.isNotEmpty() && sha != meu) sha else ""
      JSONObject().put("sha", nova).put("notas", j.optString("notas")).toString()
    } catch (e: Exception) { "{\"sha\":\"\",\"notas\":\"\"}" }
  }

  // baixa e abre o instalador. Devolve "ok", "permissao" ou "erro: ..."
  fun instalar(ctx: Context): String {
    return try {
      if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
        ctx.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return "permissao"
      }
      val f = File(ctx.cacheDir, "RoboSinais-update.apk")
      f.delete()
      val c = URL("$BASE/apk").openConnection() as HttpURLConnection
      c.connectTimeout = 15000
      c.readTimeout = 180000
      if (c.responseCode !in 200..299) return "erro: download " + c.responseCode
      c.inputStream.use { i -> f.outputStream().use { o -> i.copyTo(o) } }
      if (f.length() < 500_000) return "erro: arquivo pequeno demais"
      val uri = androidx.core.content.FileProvider.getUriForFile(ctx, ctx.packageName + ".robofiles", f)
      val i = Intent(Intent.ACTION_VIEW)
      i.setDataAndType(uri, "application/vnd.android.package-archive")
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
      ctx.startActivity(i)
      "ok"
    } catch (e: Exception) {
      "erro: " + (e.message ?: e.javaClass.simpleName).take(60)
    }
  }
}
