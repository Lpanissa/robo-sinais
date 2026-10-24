package expo.modules.robonative

import android.content.Context
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RoboModule : Module() {
  private val ctx: Context
    get() = appContext.reactContext ?: throw IllegalStateException("sem contexto")

  override fun definition() = ModuleDefinition {
    Name("RoboNative")

    // liga o vigia que avisa cada ordem com lucro (fica ligado mesmo com o app fechado)
    Function("ligarAvisos") {
      ctx.getSharedPreferences("robosinais", Context.MODE_PRIVATE).edit().putBoolean("avisosLigados", true).apply()
      AvisoService.iniciar(ctx)
      true
    }
    Function("definirVersao") { sha: String -> Updater.definirVersao(ctx, sha); true }
    AsyncFunction("verAtualizacao") { promise: Promise ->
      Thread { promise.resolve(Updater.verificar(ctx)) }.start()
    }
    AsyncFunction("instalarAtualizacao") { promise: Promise ->
      Thread { promise.resolve(Updater.instalar(ctx)) }.start()
    }
  }
}
