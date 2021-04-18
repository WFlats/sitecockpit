sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/MessageBox",
	"sap/m/Dialog",
	"sap/base/Log",
	"sap/ui/model/json/JSONModel"
], function (BaseController, Filter, FilterOperator, MessageBox, Dialog, Log, JSONModel) {
	"use strict";

	return BaseController.extend("card.Analytics.CardAnalytics.controller.Cards", {
		onInit: function () {
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				projectID: "",
				projectCode: "",
				projectDescription: "",
				selectProjectTitle: ""
			});

			this.setModel(oViewModel, "cardsView");

			this.selectProject();
		},

		selectProject: function () {
			this._createProjectSelectionDialog();
			this.projectSelectionDialog.open();
		},

		_createProjectSelectionDialog: function () {
			var sTitle = this.getResourceBundle().getText("selectProjectDialogTitle");

			if (!this.projectSelectionDialog) {
				this.projectSelectionDialog = new Dialog({
					title: sTitle,
					contentWidth: "50%",
					resizable: true,
					draggable: true,
					content: [
						sap.ui.xmlfragment("projectSelectFrag", "card.Analytics.CardAnalytics.view.SelectProject", this)
					]
				});
			}
			//this.projectSelectionDialog.setDraggable(true);
			this.projectSelectionDialog.addStyleClass("sapUiContentPadding");
			this.getView().addDependent(this.projectSelectionDialog);
		},

		onProjectSelected: function (oEvent) {
			var sProjectID = oEvent.getParameter("listItem").getBindingContext().getProperty("ID"),
				aSeverityTypes = [],
				that = this;

			this.projectSelectionDialog.close();
			this.getModel("cardsView").setProperty("/projectID", sProjectID);

			this.setPageTitle(sProjectID);
			this._getSeverityTypes()
				.then(function (aSevTypes) {
					aSeverityTypes = aSevTypes;
					return that.setSeverityCard(aSeverityTypes, "problem");
				}).then(function () {
					return that.setSeverityCard(aSeverityTypes, "quality");
				}).then(function () {
					return that.setSeverityCard(aSeverityTypes, "HnS");
				}).catch(function (oError) {
					Log.error(oError);
				});
			this._getTypes("/ProblemTypes")
				.then(function (aProblemTypes) {
					return that.setTypeCard(aProblemTypes, "problem");
				})
				.then(function (oValue) {
					return that._getTypes("/QualityTypes");
				})
				.then(function (aQualityTypes) {
					return that.setTypeCard(aQualityTypes, "quality");
				})
				.then(function () {
					return that._getTypes("/HealthAndSafetyTypes");
				}).then(function (aHnSTypes) {
					return that.setTypeCard(aHnSTypes, "HnS");
				})
				.catch(function (oError) {
					Log.error(oError);
				});
			this.setProductivityCard();
		},

		onProjectListUpdateFinished: function (oEvent) {
			var oFrag = sap.ui.core.Fragment,
				oList = oFrag.byId("projectSelectFrag", "projectsTable"),
				sTitle,
				iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("cardsView");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("selectProjectTitle", [iTotalItems]);
				} else {
					sTitle = this.getResourceBundle().getText("selectProjectTitleEmpty");
				}
				oViewModel.setProperty("/selectProjectTitle", sTitle);
			}
		},

		setPageTitle: function (sProjectID) {
			var oModel = this.getModel(),
				sPath = "/" + oModel.createKey("Projects", {
					ID: sProjectID
				}),
				oTitle = this.byId("contentTitle");

			oModel.read(sPath, {
				success: function (oData) {
					oTitle.setText(oData.code + " - " + oData.description);
				},
				error: function (oError) {
					Log.error("Error reading project title " + JSON.stringify(oError));
				}
			});
		},

		setProductivityCard: function () {
			var oModel = this.getModel(),
				oViewModel = this.getModel("cardsView"),
				sProjectID = oViewModel.getProperty("/projectID"),
				oChart = this.byId("productivityChart"),
				aFilter,
				sColor,
				oProjectFilter = new Filter({
					path: "project_ID",
					operator: FilterOperator.EQ,
					value1: sProjectID
				}),
				oStatusFilter = new Filter({
					path: "status",
					operator: FilterOperator.GT,
					value1: 1
				}),
				aProductivityKPIFilters = [
					new Filter({
						path: "KPI",
						operator: FilterOperator.GT,
						value1: 1.000
					}),
					new Filter({
						path: "KPI",
						operator: FilterOperator.BT,
						value1: 0.900,
						value2: 1.000
					}),
					new Filter({
						path: "KPI",
						operator: FilterOperator.LT,
						value1: 0.900
					})
				],
				aChartDescriptions = [
					"> 1.000",
					"0.900 to 1.000",
					"< 0.900"
				];

			oViewModel.setProperty("/busy", true);
			oChart.removeAllSegments();
			// create all segments and set the values in the success handler
			for (var i = 0; i < 4; i++) {
				switch (i) {
				case 0:
					sColor = "Good";
					break;
				case 1:
					sColor = "Critical";
					break;
				default:
					sColor = "Error";
				}
				oChart.addSegment(new sap.suite.ui.microchart.InteractiveDonutChartSegment({
					displayedValue: "0",
					label: aChartDescriptions[i],
					value: 0,
					color: sColor
				}));
			}
			oChart.setDisplayedSegments(3);
			aProductivityKPIFilters.reduce(function (p, value, index) {
				new Promise(function (resolve) {
					aFilter = [new Filter({
						filters: [
							oProjectFilter,
							oStatusFilter,
							aProductivityKPIFilters[index]
						],
						and: true
					})];
					oViewModel.setProperty("/busy", true);
					oModel.read("/Tasks", {
						urlParameters: {
							$inlinecount: "allpages",
							$top: 1
						},
						groupId: String(index),
						filters: aFilter,
						success: function (oData) {
							if (oData.__count > 0) {
								oChart.getSegments()[index].setValue(Number(oData.__count));
								oChart.getSegments()[index].setDisplayedValue(oData.__count);
							}
							oViewModel.setProperty("/busy", false);
						},
						error: function (oError) {
							Log.error("Error reading Tasks" + JSON.stringify(oError));
							oViewModel.setProperty("/busy", false);
						}
					});
				});
			}, Promise.resolve(), 0);
		},

		setSeverityCard: function (aSeverityTypes, sType) {
			var oModel = this.getModel(),
				oViewModel = this.getModel("cardsView"),
				sProjectID = oViewModel.getProperty("/projectID"),
				oChart,
				sIsPath,
				sColor;
			switch (sType) {
			case "problem":
				oChart = this.byId("problemChart");
				sIsPath = "isProblem";
				break;
			case "quality":
				oChart = this.byId("qualityChart");
				sIsPath = "isQuality";
				break;
			case "HnS":
				oChart = this.byId("HnSChart");
				sIsPath = "isHnS";
				break;
			}
			oChart.removeAllSegments();
			aSeverityTypes.reduce(function (a, value, i) {
				new Promise(function (resolve) {
					var aFilters = [new Filter({
						filters: [
							new Filter({
								path: "project_ID",
								operator: FilterOperator.EQ,
								value1: sProjectID
							}),
							new Filter({
								path: sIsPath,
								operator: FilterOperator.EQ,
								value1: true
							}),
							new Filter({
								path: "severity/number",
								operator: FilterOperator.EQ,
								value1: value.number
							})
						],
						and: true
					})];

					oViewModel.setProperty("/busy", true);
					oModel.read("/ProblemCards", {
						urlParameters: {
							$inlinecount: "allpages",
							$top: 1,
							"$expand": "severity"
						},
						groupId: sType,
						filters: aFilters,
						success: function (oData) {
							if (oData.__count > 0) {
								switch (aSeverityTypes[i].number) {
								case 1:
									sColor = "Error";
									break;
								case 2:
									sColor = "Critical";
									break;
								default:
									sColor = "Neutral";
								}
								var oSegment = new sap.suite.ui.microchart.InteractiveDonutChartSegment({
									displayedValue: oData.__count,
									label: aSeverityTypes[i].description,
									value: Number(oData.__count),
									color: sColor
								});
								oChart.addSegment(oSegment);
								oChart.setDisplayedSegments(oChart.getSegments().length);
							}

							oViewModel.setProperty("/busy", false);
						},
						error: function (oError) {
							Log.error("Error reading Cards " + sType + JSON.stringify(oError));
							oViewModel.setProperty("/busy", false);
						}
					});
				});
			}, Promise.resolve());
		},

		setTypeCard: function (aTypes, sType) {
			var oModel = this.getModel(),
				oViewModel = this.getModel("cardsView"),
				sProjectID = oViewModel.getProperty("/projectID"),
				oChart,
				sIsPath,
				sExpandPath;

			switch (sType) {
			case "problem":
				oChart = this.byId("problemTypeChart");
				sIsPath = "isProblem";
				sExpandPath = "problem";
				break;
			case "quality":
				oChart = this.byId("qualityTypeChart");
				sIsPath = "isQuality";
				sExpandPath = "quality";
				break;
			case "HnS":
				oChart = this.byId("HnSTypeChart");
				sIsPath = "isHnS";
				sExpandPath = "HealthandSafety";
				break;
			}
			oViewModel.setProperty("/busy", true);
			oChart.removeAllSegments();
			aTypes.reduce(function (p, value, i) {
				new Promise(function (resolve) {
					var aFilters = [new Filter({
						filters: [
							new Filter({
								path: "project_ID",
								operator: FilterOperator.EQ,
								value1: sProjectID
							}),
							new Filter({
								path: sIsPath,
								operator: FilterOperator.EQ,
								value1: true
							}),
							new Filter({
								path: sExpandPath + "/number",
								operator: FilterOperator.EQ,
								value1: value.number
							})
						],
						and: true
					})];
					oViewModel.setProperty("/busy", true);
					oModel.read("/ProblemCards", {
						urlParameters: {
							$inlinecount: "allpages",
							$top: 1,
							"$expand": sExpandPath
						},
						groupId: sType,
						filters: aFilters,
						success: function (oData) {
							if (oData.__count > 0) {
								oChart.addSegment(new sap.suite.ui.microchart.InteractiveDonutChartSegment({
									displayedValue: oData.__count,
									label: aTypes[i].description,
									value: Number(oData.__count),
									color: "Neutral"
								}));
								oChart.setDisplayedSegments(oChart.getSegments().length);
							}
							//Log.error("chart: " + oChart.getId() + ", no Segments: " + oChart.getSegments().length);
							//Log.error("label: " + aTypes[i].description + ", value: " + oData.__count);
							oViewModel.setProperty("/busy", false);
						},
						error: function (oError) {
							Log.error("Error reading Cards " + sType + " " + JSON.stringify(oError));
							oViewModel.setProperty("/busy", false);
						}
					});
				});
			}, Promise.resolve());
		},

		_getSeverityTypes: function () {
			var oModel = this.getModel(),
				aSeverityTypes = [];
			return new Promise(function (resolve) {
				oModel.read("/SeverityTypes", {
					success: function (oData) {
						for (var i = 0; i < oData.results.length; i++) {
							aSeverityTypes.push({
								number: oData.results[i].number,
								description: oData.results[i].description,
								count: 0
							});
						}
						aSeverityTypes.sort(function (a, b) {
							return a.number - b.number;
						});
						resolve(aSeverityTypes);
					},
					error: function () {
						Log.error("Error reading Severity Types");
					}
				});
			});
		},

		_getTypes: function (sPath) {
			var oModel = this.getModel(),
				aQualityTypes = [];
			return new Promise(function (resolve) {
				oModel.read(sPath, {
					success: function (oData) {
						for (var i = 0; i < oData.results.length; i++) {
							aQualityTypes.push({
								number: oData.results[i].number,
								description: oData.results[i].description,
								count: 0
							});
						}
						aQualityTypes.sort(function (a, b) {
							return a.number - b.number;
						});
						resolve(aQualityTypes);
					},
					error: function () {
						Log.error("Error reading Types " + sPath);
					}
				});
			});
		}
	});
});