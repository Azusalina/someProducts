#include <KWindowEffects>
#include <QWindow>
#include <QPainterPath>
#include <QRegion>
extern "C" void toolkit_blur(QWindow *window, int width, int height, int radius) {
    if (!window) return;
    QPainterPath shape;
    shape.addRoundedRect(0, 0, width, height, radius, radius);
    KWindowEffects::enableBlurBehind(window, true, QRegion(shape.toFillPolygon().toPolygon()));
}
