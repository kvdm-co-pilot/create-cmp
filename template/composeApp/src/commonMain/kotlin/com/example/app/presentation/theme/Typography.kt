package __PACKAGE__.presentation.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import org.jetbrains.compose.resources.Font
import __PACKAGE__.generated.resources.DMSans_Bold
import __PACKAGE__.generated.resources.DMSans_Medium
import __PACKAGE__.generated.resources.DMSans_Regular
import __PACKAGE__.generated.resources.DMSans_SemiBold
import __PACKAGE__.generated.resources.Res

// DM Sans font family — weights 400/500/600/700 bundled in composeResources/font/.
val DmSansFontFamily: FontFamily
    @Composable get() = FontFamily(
        Font(Res.font.DMSans_Regular,  weight = FontWeight.Normal),
        Font(Res.font.DMSans_Medium,   weight = FontWeight.Medium),
        Font(Res.font.DMSans_SemiBold, weight = FontWeight.SemiBold),
        Font(Res.font.DMSans_Bold,     weight = FontWeight.Bold),
    )

@Composable
fun remember__THEME_PREFIX__Typography(): Typography {
    val dmSans = DmSansFontFamily
    return Typography(
        displayLarge   = TextStyle(fontFamily = dmSans, fontWeight = FontWeight.Bold,     fontSize = 32.sp),
        headlineMedium = TextStyle(fontFamily = dmSans, fontWeight = FontWeight.SemiBold, fontSize = 24.sp),
        titleMedium    = TextStyle(fontFamily = dmSans, fontWeight = FontWeight.SemiBold, fontSize = 18.sp),
        bodyLarge      = TextStyle(fontFamily = dmSans, fontWeight = FontWeight.Normal,   fontSize = 16.sp),
        bodyMedium     = TextStyle(fontFamily = dmSans, fontWeight = FontWeight.Normal,   fontSize = 14.sp),
        labelSmall     = TextStyle(fontFamily = dmSans, fontWeight = FontWeight.Medium,   fontSize = 12.sp),
    )
}
