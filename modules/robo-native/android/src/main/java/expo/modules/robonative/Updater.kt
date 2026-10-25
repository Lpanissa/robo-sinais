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
  // o repositório é público: a versão atual fica na release "app" do GitHub
  private const val INFO = "https://api.github.com/repos/Lpanissa/robo-sinais/releases/tags/app"
  private const val APK = "https://github.com/Lpanissa/robo-sinais/releases/download/app/robo-sinais.apk"

  private fun p(ctx: Context) = ctx.getSharedPreferences("robosinais", Context.MODE_PRIVATE)

  fun definirVersao(ctx: Context, sha: String) { p(ctx).edit().putString("sha", sha).apply() }

  // devolve {"sha": versão nova ou "", "notas": novidades} em texto JSON
  fun verificar(ctx: Context): String {
    val meu = p(ctx).getString("sha", "") ?: ""
    return try {
      val c = URL(INFO).openConnection() as HttpURLConnection
      c.connectTimeout = 8000
      c.readTimeout = 8000
      c.setRequestProperty("Accept", "application/vnd.github+json")
      c.setRequestProperty("User-Agent", "PanissAsset")
      val j = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
      val sha = j.optString("target_commitish")
      val nova = if (meu.isNotEmpty() && meu != "dev" && sha.isNotEmpty() && sha != meu) sha else ""
      JSONObject().put("sha", nova).put("notas", j.optString("body")).toString()
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
      // o GitHub manda para outro endereço (redirecionamento); segue até o arquivo
      var url = URL(APK)
      var c = url.openConnection() as HttpURLConnection
      for (i in 0 until 5) {
        c.instanceFollowRedirects = false
        c.connectTimeout = 15000
        c.readTimeout = 180000
        c.setRequestProperty("User-Agent", "PanissAsset")
        val code = c.responseCode
        if (code in 300..399) { url = URL(url, c.getHeaderField("Location")); c.disconnect(); c = url.openConnection() as HttpURLConnection } else break
      }
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
