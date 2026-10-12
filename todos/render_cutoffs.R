#!/usr/bin/env Rscript
# Run from any directory; defaults are relative to this script, not the shell.
file_arg <- grep("^--file=", commandArgs(), value = TRUE)
script_dir <- if (length(file_arg)) dirname(normalizePath(sub("^--file=", "", file_arg[1]))) else getwd()
source(file.path(script_dir, "cutoff_helpers.R"))

usage <- paste(
  "Usage: Rscript render_cutoffs.R [--input=data.csv] [--papers=papers.csv]",
  "       [--output=product1] [--format=both|svg|png] [--grades=5**,5*,5,4,3,2]",
  "       [--subjects=English,Chinese]",
  "       [--year=2027] [--level=0.95] [--since=2018]",
  "Relative paths are resolved from the script directory.", sep = "\n"
)
args <- commandArgs(trailingOnly = TRUE)
if ("--help" %in% args) { cat(usage, "\n"); quit(status = 0) }
options <- list(input = "data.csv", papers = "papers.csv", output = "product1", format = "both",
                grades = paste(grade_order, collapse = ","), subjects = NULL,
                year = "2027", level = "0.95", since = NULL)
for (arg in args) {
  if (!grepl("^--[^=]+=.+$", arg)) stop("Invalid argument: ", arg, "\n", usage)
  key <- sub("^--([^=]+)=.*$", "\\1", arg)
  if (!key %in% names(options)) stop("Unknown option: ", key, "\n", usage)
  options[[key]] <- sub("^--[^=]+=", "", arg)
}
resolve_path <- function(path) if (grepl("^(/|[A-Za-z]:[/\\\\])", path)) path else file.path(script_dir, path)
for (package in c("ggplot2", "svglite", "ragg")) {
  if (!requireNamespace(package, quietly = TRUE)) stop("Install the required R package: ", package)
}
if (!options$format %in% c("both", "svg", "png")) stop("--format must be both, svg or png.")
grades <- unique(trimws(strsplit(options$grades, ",", fixed = TRUE)[[1]]))
if (any(!grades %in% grade_order)) stop("--grades must contain only: ", paste(grade_order, collapse = ", "))
data <- read_cutoffs(resolve_path(options$input))
paper_path <- resolve_path(options$papers)
source_label <- basename(options$input)
if (file.exists(paper_path)) {
  data <- rbind(data, read_cutoffs(paper_path, papers_only = TRUE))
  source_label <- paste(source_label, basename(paper_path), sep = " + ")
} else if (any(grepl("^--papers=", args))) {
  stop("Paper file does not exist: ", paper_path)
}
validate_cutoffs(data)
since <- if (!is.null(options$since)) suppressWarnings(as.numeric(options$since)) else NULL
if (!is.null(since) && (!is.finite(since) || since != floor(since))) stop("--since must be an integer year.")
forecasts <- forecast_cutoffs(data, suppressWarnings(as.numeric(options$year)), suppressWarnings(as.numeric(options$level)), since)
subjects <- unique(data$Subject)
if (!is.null(options$subjects)) {
  subjects <- unique(trimws(strsplit(options$subjects, ",", fixed = TRUE)[[1]]))
  unknown <- setdiff(subjects, data$Subject)
  if (length(unknown)) stop("Unknown subjects: ", paste(unknown, collapse = ", "))
}
filenames <- gsub("[^[:alnum:]_-]+", "_", subjects)
if (anyDuplicated(tolower(filenames))) stop("Subject names produce colliding output filenames.")
out_dir <- resolve_path(options$output)
if (!dir.exists(out_dir) && !dir.create(out_dir, recursive = TRUE)) stop("Cannot create output directory: ", out_dir)
selected_data <- data[data$Subject %in% subjects & data$Grade %in% grades, ]
selected_data$Color <- unname(grade_colors[selected_data$Grade])
selected_forecasts <- forecasts[forecasts$Subject %in% subjects & forecasts$Grade %in% grades, ]
write.csv(selected_data, file.path(out_dir, "chart_data.csv"), row.names = FALSE, na = "")
write.csv(selected_forecasts, file.path(out_dir, paste0("forecast_", options$year, ".csv")), row.names = FALSE)
for (i in seq_along(subjects)) {
  plot <- make_cutoff_plot(data, subjects[i], grades, source_label, forecasts)
  paper_count <- length(setdiff(unique(data$Series[data$Subject == subjects[i]]), "Overall"))
  height <- 7.6 + paper_count * 0.3
  formats <- if (options$format == "both") c("svg", "png") else options$format
  for (format in formats) {
    path <- file.path(out_dir, paste0(filenames[i], ".", format))
    device <- if (format == "svg") svglite::svglite else ragg::agg_png
    ggplot2::ggsave(path, plot = plot, device = device, width = 12, height = height,
                    units = "in", dpi = 180, bg = "white", limitsize = FALSE)
    message("Saved ", path)
  }
}
