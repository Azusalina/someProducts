# Plotting and validation shared by render_cutoffs.R.
grade_order <- c("5**", "5*", "5", "4", "3", "2")
grade_colors <- c(
  "5**" = "#A23846", "5*" = "#A66512", "5" = "#55733A",
  "4" = "#167F83", "3" = "#365F9B", "2" = "#79539B"
)

read_cutoffs <- function(path, papers_only = FALSE) {
  data <- read.csv(path, fileEncoding = "UTF-8-BOM", check.names = FALSE,
                   colClasses = "character", na.strings = c("", "NA"))
  required <- c("Subject", "Year", "Grade", "Percentage")
  missing <- setdiff(required, names(data))
  if (length(missing)) stop(path, ": missing columns: ", paste(missing, collapse = ", "))
  for (column in names(data)) data[[column]] <- trimws(data[[column]])
  if (anyNA(data[required[1:3]])) stop(path, ": Subject, Year and Grade cannot be blank.")
  for (column in c("Year", "Percentage")) {
    original <- data[[column]]
    data[[column]] <- suppressWarnings(as.numeric(original))
    if (any(!is.na(original) & (!is.finite(data[[column]]) | is.na(data[[column]])))) {
      stop(path, ": invalid numeric value in ", column, ".")
    }
  }
  if (any(data$Year != floor(data$Year) | data$Year < 1900 | data$Year > 2200)) {
    stop(path, ": Year must be an integer between 1900 and 2200.")
  }
  if (any(data$Percentage < 0 | data$Percentage > 100, na.rm = TRUE)) {
    stop(path, ": Percentage must be between 0 and 100.")
  }
  component_column <- intersect(c("Paper", "Component"), names(data))
  if (length(component_column) > 1) stop(path, ": use either Paper or Component, not both.")
  data$Series <- if (length(component_column)) data[[component_column]] else "Overall"
  data$Series[is.na(data$Series) | tolower(data$Series) %in% c("overall", "total")] <- "Overall"
  if (papers_only && any(data$Series == "Overall")) {
    stop(path, ": paper rows need a nonblank Paper (or Component) column.")
  }
  data$Weighting <- if ("Weighting" %in% names(data)) data$Weighting else NA_character_
  original_weight <- data$Weighting
  data$Weighting <- suppressWarnings(as.numeric(sub("%$", "", original_weight)))
  if (any(!is.na(original_weight) & (!is.finite(data$Weighting) | is.na(data$Weighting))) ||
      any(data$Weighting < 0 | data$Weighting > 100, na.rm = TRUE)) {
    stop(path, ": Weighting must be a percentage such as 20 or 20%.")
  }
  unknown <- setdiff(unique(data$Grade), c(grade_order, "Full Mark"))
  if (length(unknown)) stop(path, ": unsupported grades: ", paste(unknown, collapse = ", "))
  data <- data[data$Grade != "Full Mark", c("Subject", "Year", "Grade", "Percentage", "Series", "Weighting")]
  if (!nrow(data)) stop(path, ": no grade cutoffs to plot.")
  data
}

validate_cutoffs <- function(data) {
  keys <- data[c("Subject", "Year", "Grade", "Series")]
  if (anyDuplicated(keys)) stop("Duplicate Subject/Year/Grade/Paper rows in the inputs.")
  by_paper_year <- split(data, interaction(data$Subject, data$Series, data$Year, drop = TRUE))
  for (rows in by_paper_year) {
    weights <- unique(rows$Weighting[!is.na(rows$Weighting)])
    if (length(weights) > 1) stop("Conflicting weightings for ", rows$Subject[1], " / ", rows$Series[1], " / ", rows$Year[1], ".")
  }
  invisible(data)
}

weight_label <- function(data, series) {
  if (series == "Overall") return("Overall")
  rows <- data[data$Series == series, c("Year", "Weighting")]
  years <- sort(unique(rows$Year))
  weights <- vapply(years, function(year) {
    known <- unique(rows$Weighting[rows$Year == year & !is.na(rows$Weighting)])
    if (length(known)) paste0(format(known[1], trim = TRUE), "%") else "not supplied"
  }, character(1))
  if (length(unique(weights)) == 1) return(paste0(series, " (weight: ", weights[1], ")"))
  # Keep changes of weighting with their paper in the same image's legend.
  runs <- cumsum(c(TRUE, weights[-1] != weights[-length(weights)] | diff(years) != 1))
  parts <- vapply(split(seq_along(years), runs), function(i) {
    span <- if (length(i) == 1) years[i] else paste0(min(years[i]), "-", max(years[i]))
    paste0(weights[i[1]], " in ", span)
  }, character(1))
  paste0(series, " (weight: ", paste(parts, collapse = "; "), ")")
}

complete_years <- function(data) {
  # Explicit NA rows break lines at missing years instead of implying observations.
  years <- seq(min(data$Year), max(data$Year))
  groups <- split(data, interaction(data$Grade, data$Series, drop = TRUE))
  result <- lapply(groups, function(rows) {
    grid <- data.frame(Year = years, Grade = rows$Grade[1], Series = rows$Series[1])
    merge(grid, rows, by = c("Year", "Grade", "Series"), all.x = TRUE, sort = TRUE)
  })
  do.call(rbind, result)
}

forecast_cutoffs <- function(data, year = 2027, level = 0.95, since = NULL) {
  if (length(year) != 1 || !is.finite(year) || year != floor(year) || year <= max(data$Year)) {
    stop("Forecast year must be an integer after the latest observed year.")
  }
  if (length(level) != 1 || !is.finite(level) || level <= 0 || level >= 1) stop("Confidence level must be between 0 and 1.")
  if (!is.null(since)) data <- data[data$Year >= since, ]
  groups <- split(data, interaction(data$Subject, data$Grade, data$Series, drop = TRUE))
  result <- lapply(groups, function(rows) {
    rows <- rows[is.finite(rows$Percentage), ]
    if (nrow(rows) < 3) {
      warning("Skipping a forecast with fewer than three observations.")
      return(NULL)
    }
    model <- lm(Percentage ~ Year, data = rows)
    target <- data.frame(Year = year)
    ci <- predict(model, target, interval = "confidence", level = level)
    pi <- predict(model, target, interval = "prediction", level = level)
    mean_se <- as.numeric(predict(model, target, se.fit = TRUE)$se.fit)
    residual_sd <- summary(model)$sigma
    degrees_freedom <- df.residual(model)
    last <- rows[which.max(rows$Year), ]
    data.frame(
      Subject = rows$Subject[1], Grade = rows$Grade[1], Series = rows$Series[1],
      Year = year, Estimate = ci[1, "fit"], ConfidenceLow = ci[1, "lwr"], ConfidenceHigh = ci[1, "upr"],
      PredictionLow = pi[1, "lwr"], PredictionHigh = pi[1, "upr"],
      HistoricalLow = min(rows$Percentage), HistoricalHigh = max(rows$Percentage),
      Observations = nrow(rows), TrainingFrom = min(rows$Year), TrainingTo = max(rows$Year),
      LastYear = last$Year, LastPercentage = last$Percentage,
      AnnualChange = unname(coef(model)["Year"]), ConfidenceLevel = level,
      MeanStandardError = mean_se, ResidualSD = residual_sd,
      PredictionStandardError = sqrt(mean_se^2 + residual_sd^2),
      DegreesFreedom = degrees_freedom, CriticalValue = qt((1 + level) / 2, degrees_freedom),
      row.names = NULL
    )
  })
  result <- do.call(rbind, result)
  if (is.null(result) || !nrow(result)) stop("No series has at least three observations for forecasting.")
  result
}

make_cutoff_plot <- function(data, subject, grades = grade_order, source_label = "data.csv", forecasts = NULL) {
  rows <- data[data$Subject == subject & data$Grade %in% grades, ]
  if (!nrow(rows) || !any(is.finite(rows$Percentage))) stop("No usable cutoffs for ", subject, ".")
  present_grades <- grades[grades %in% rows$Grade]
  papers <- sort(setdiff(unique(rows$Series), "Overall"))
  series <- c(if ("Overall" %in% rows$Series) "Overall", papers)
  labels <- vapply(series, function(s) weight_label(rows, s), character(1))
  names(labels) <- series
  # Paper lines share their grade's hue, with reduced opacity and thinner strokes.
  alpha <- setNames(ifelse(series == "Overall", 1, 0.42), series)
  widths <- setNames(ifelse(series == "Overall", 1.05, 0.7), series)
  patterns <- setNames(rep(c("dashed", "dotdash", "longdash", "dotted", "twodash"), length.out = length(series)), series)
  if ("Overall" %in% series) patterns["Overall"] <- "solid"
  completed <- complete_years(rows)
  completed$Grade <- factor(completed$Grade, levels = grades)
  completed$Series <- factor(completed$Series, levels = series)
  paper_rows <- completed[completed$Series != "Overall", ]
  overall_rows <- completed[completed$Series == "Overall", ]
  year_min <- min(rows$Year)
  year_max <- max(rows$Year)
  forecast_rows <- if (!is.null(forecasts)) forecasts[forecasts$Subject == subject & forecasts$Grade %in% grades, ] else NULL
  has_forecast <- !is.null(forecast_rows) && nrow(forecast_rows) > 0
  plot_year_max <- if (has_forecast) max(forecast_rows$Year) else year_max
  year_breaks <- sort(unique(c(seq(year_min, year_max, by = 2), year_max, plot_year_max)))
  y_limits <- c(0, 100)
  caption <- paste0("Source: ", source_label, ". Cutoffs shown as supplied; Full Mark rows omitted.")
  if (!length(papers)) caption <- paste0(caption, " No paper data supplied.")
  if (has_forecast) {
    confidence <- format(100 * forecast_rows$ConfidenceLevel[1], trim = TRUE)
    caption <- paste0(caption, "\n", plot_year_max, ": linear trend; ", confidence,
                      "% CI = mean estimate; ", confidence, "% prediction range = future cutoff. Model assumes a stable trend and independent, constant-variance residuals.")
    y_limits <- c(min(0, floor(min(forecast_rows$PredictionLow) / 10) * 10),
                  max(100, ceiling(max(forecast_rows$PredictionHigh) / 10) * 10))
  }
  caption <- paste(strwrap(caption, width = 135), collapse = "\n")
  plot <- ggplot2::ggplot(completed, ggplot2::aes(
    Year, Percentage, colour = Grade, linetype = Series,
    alpha = Series, linewidth = Series, group = interaction(Grade, Series)
  )) +
    ggplot2::geom_line(data = paper_rows, na.rm = TRUE) +
    ggplot2::geom_point(data = paper_rows, size = 1.4, na.rm = TRUE) +
    ggplot2::geom_line(data = overall_rows, na.rm = TRUE) +
    ggplot2::geom_point(data = overall_rows, size = 2.0, na.rm = TRUE) +
    ggplot2::scale_colour_manual(values = grade_colors, breaks = present_grades, drop = FALSE) +
    ggplot2::scale_linetype_manual(values = patterns, breaks = series, labels = labels) +
    ggplot2::scale_alpha_manual(values = alpha, guide = "none") +
    ggplot2::scale_linewidth_manual(values = widths, guide = "none") +
    ggplot2::scale_x_continuous(breaks = year_breaks, limits = c(year_min - 0.25, plot_year_max + 1.6), expand = c(0, 0)) +
    ggplot2::scale_y_continuous(limits = y_limits, breaks = seq(y_limits[1], y_limits[2], 20), labels = function(x) paste0(x, "%")) +
    ggplot2::labs(title = subject, subtitle = paste0("HKDSE grade cutoff trends  |  ", year_min, "-", year_max,
                  if (has_forecast) paste0("\n", plot_year_max, " estimate: diamond  |  CI: thick bar  |  Prediction range: thin bar")),
                  x = NULL, y = "Cutoff (% of full marks)", colour = "Grade", linetype = "Series / paper weighting", caption = caption) +
    ggplot2::guides(
      colour = ggplot2::guide_legend(order = 1, nrow = 1, override.aes = list(alpha = 1, linetype = "solid", linewidth = 1)),
      linetype = ggplot2::guide_legend(order = 2, ncol = 1, override.aes = list(colour = "#344054", alpha = unname(alpha), linewidth = unname(widths)))
    ) +
    ggplot2::theme_minimal(base_size = 12, base_family = "sans") +
    ggplot2::theme(
      plot.title = ggplot2::element_text(size = 26, face = "bold", colour = "#182230"),
      plot.subtitle = ggplot2::element_text(size = 12, colour = "#667085", margin = ggplot2::margin(b = 22)),
      plot.caption = ggplot2::element_text(size = 9, colour = "#667085", hjust = 0, margin = ggplot2::margin(t = 16)),
      panel.grid.minor = ggplot2::element_blank(), panel.grid.major.x = ggplot2::element_blank(),
      panel.grid.major.y = ggplot2::element_line(colour = "#EAECF0", linewidth = 0.4),
      axis.text = ggplot2::element_text(colour = "#667085"),
      axis.title.y = ggplot2::element_text(margin = ggplot2::margin(r = 12)),
      legend.position = "bottom", legend.box = "vertical", legend.box.just = "left",
      legend.justification = "left", legend.key.width = grid::unit(1.1, "cm"),
      legend.title = ggplot2::element_text(size = 10, face = "bold"), legend.text = ggplot2::element_text(size = 10),
      plot.margin = ggplot2::margin(22, 22, 18, 18), plot.background = ggplot2::element_rect(fill = "white", colour = NA)
    )
  # Label only overall endpoints, with spacing to keep close grade boundaries legible.
  if (has_forecast) {
    plot <- plot +
      ggplot2::geom_vline(xintercept = (year_max + plot_year_max) / 2, colour = "#D0D5DD", linetype = "dotted", linewidth = 0.5) +
      ggplot2::geom_segment(data = forecast_rows, ggplot2::aes(x = LastYear, xend = Year, y = LastPercentage, yend = Estimate, colour = Grade, alpha = Series), inherit.aes = FALSE, linetype = "dashed", linewidth = 0.65, show.legend = FALSE) +
      ggplot2::geom_errorbar(data = forecast_rows, ggplot2::aes(x = Year, ymin = PredictionLow, ymax = PredictionHigh, colour = Grade, alpha = Series), inherit.aes = FALSE, width = 0.22, linewidth = 0.45, show.legend = FALSE) +
      ggplot2::geom_errorbar(data = forecast_rows, ggplot2::aes(x = Year, ymin = ConfidenceLow, ymax = ConfidenceHigh, colour = Grade, alpha = Series), inherit.aes = FALSE, width = 0.11, linewidth = 1.35, show.legend = FALSE) +
      ggplot2::geom_point(data = forecast_rows, ggplot2::aes(x = Year, y = Estimate, colour = Grade, alpha = Series), inherit.aes = FALSE, shape = 18, size = 3.3, show.legend = FALSE)
    ends <- forecast_rows[forecast_rows$Series == "Overall", ]
    ends$Percentage <- ends$Estimate
  } else {
    ends <- rows[rows$Series == "Overall" & rows$Year == year_max & is.finite(rows$Percentage), ]
  }
  if (nrow(ends)) {
    ends <- ends[order(ends$Percentage), ]
    ends$LabelY <- ends$Percentage
    if (nrow(ends) > 1) for (i in 2:nrow(ends)) ends$LabelY[i] <- max(ends$LabelY[i], ends$LabelY[i - 1] + 4)
    ends$LabelY <- ends$LabelY - max(0, max(ends$LabelY) - 98)
    ends$Label <- paste0(ends$Grade, "  ", format(round(ends$Percentage, 1), trim = TRUE), "%")
    plot <- plot +
      ggplot2::geom_segment(data = ends, ggplot2::aes(x = Year + 0.1, xend = Year + 0.35, y = Percentage, yend = LabelY, colour = Grade), inherit.aes = FALSE, linewidth = 0.35, show.legend = FALSE) +
      ggplot2::geom_text(data = ends, ggplot2::aes(x = Year + 0.42, y = LabelY, label = Label, colour = Grade), inherit.aes = FALSE, hjust = 0, size = 3.4, fontface = "bold", show.legend = FALSE)
  }
  plot
}
