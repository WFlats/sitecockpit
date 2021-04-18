sap.ui.define([
	"./BaseController",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device",
	"../model/formatter",
	"sap/m/library"
], function (BaseController, Filter, FilterOperator, Sorter, JSONModel, Device, formatter, mobileLibrary) {
	"use strict";

	return BaseController.extend("project.data.ProjectData.controller.Workers", {

		formatter: formatter,

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				availableWorkersListTitle: "",
				countWorkers: 0,
				selected: false
			});
			this.setModel(oViewModel, "workersView");
			this.initialFilter = new Filter("deployment_ID", FilterOperator.EQ, null);

			this.getRouter().getRoute("Workers").attachPatternMatched(this._onObjectMatched, this);
			//this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));
		},

		_onObjectMatched: function (oEvent) {
			// pattern "Projects/{objectId}" causes "not found" error; not succeeded passing the objectId
			/*			var sObjectId = oEvent.getParameter("arguments").objectId;
						//this.getModel("appView").setProperty("/layout", "TwoColumnsEndExpanded");
						this.getModel().metadataLoaded().then(function () {
							var sObjectPath = this.getModel().createKey("Projects", {
								ID: sObjectId
							});
							this._bindView("/" + sObjectPath);
						}.bind(this));
			*/
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID");
			if (sProjectID) {
				var sPath = "/" + oModel.createKey("Projects", {
						ID: sProjectID
					}),
					oObject = oModel.getObject(sPath),
					oStartDate = new Date(),
					oEndDate = new Date();
				// set date picker values
				switch (oObject.status) {
				case 0:
					oStartDate = oObject.plannedStartDate;
					oEndDate = oObject.plannedEndDate;
					break;
				case 1:
					oStartDate = oObject.actualStartDate;
					oEndDate = oObject.estimatedEndDate;
					break;
				case 2:
					oStartDate = oObject.actualStartDate;
					oEndDate = oObject.actualEndDate;
					break;
				}
				this.byId("DPStart").setDateValue(oStartDate);
				this.byId("DPEnd").setDateValue(oEndDate);
				// save the dates also in appView; properties "deploymentStart", "deploymentEnd" are saved by the DP change handler
				this.getModel("appView").setProperty("/projectStart", oStartDate);
				this.getModel("appView").setProperty("/projectEnd", oEndDate);
			}
		},

		onWorkerListUpdateFinished: function (oEvent) {
			this._updateWorkerListItemCount(oEvent.getParameter("total"));
		},

		_updateWorkerListItemCount: function (iTotalItems) {
			var sTitle,
				oViewModel = this.getModel("workersView");
			// only update the counter if the length is final
			if (this.byId("workersList").getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("availableWorkersListTitle", [iTotalItems]);
				oViewModel.setProperty("/availableWorkersListTitle", sTitle);
				oViewModel.setProperty("/countWorkers", iTotalItems);
			}
		},

		onWorkersSelectionChange: function () {
			var aSelectedWorkers = this.byId("workersList").getSelectedItems(),
				oViewModel = this.getModel("workersView");
			if (aSelectedWorkers && aSelectedWorkers.length > 0) {
				oViewModel.setProperty("/selected", true);
			} else {
				oViewModel.setProperty("/selected", false);
			}
		},

		onRemoveWorker: function (oEvent) {
			var oDraggedItem = oEvent.getParameter("draggedControl"),
				oDraggedItemContext = oDraggedItem.getBindingContext(),
				oList = this.byId("workersList").getBinding("items");
			if (!oDraggedItemContext) {
				return;
			}

			var oModel = this.getModel(),
				sPath = "/" + oModel.createKey("WorkerDeployments", {
					ID: oDraggedItemContext.getProperty("deployment_ID") // workersList is "/Persons"
				});
			oModel.remove(sPath, {
				success: function () {
					// remove worker deployment
					oModel.setProperty("deployment_ID", null, oDraggedItemContext);
					// also remove worker from crew
					oModel.setProperty("memberOfCrew_ID", null, oDraggedItemContext);
					oModel.submitChanges({
						success: function () {
							oList.refresh();
						}
					});
				}
			});
		},

		onDeployWorkers: function () {
			var oList = this.byId("workersList"),
				aSelectedWorkers = oList.getSelectedItems(),
				oViewModel = this.getModel("workersView"),
				oAppView = this.getModel("appView"),
				oModel = this.getModel(),
				sProjectID = oAppView.getProperty("/selectedProjectID"),
				oDeploymentStart = this.byId("DPStart").getDateValue(),
				oDeploymentEnd = this.byId("DPEnd").getDateValue();

			oDeploymentStart = this.adjustUTC(oDeploymentStart);
			oDeploymentEnd = this.adjustUTC(oDeploymentEnd);

			aSelectedWorkers.reduce(function (v, oItem, i, aItems) {
				new Promise(function () {
					var oWorkerBC = oItem.getBindingContext(),
						sWorkerID = oWorkerBC.getObject().ID,
						oWorkerDeployment = {};
					oWorkerDeployment.worker_ID = sWorkerID;
					oWorkerDeployment.project_ID = sProjectID;
					oWorkerDeployment.deploymentStart = oDeploymentStart;
					oWorkerDeployment.deploymentEnd = oDeploymentEnd;
					oViewModel.setProperty("/busy", true);
					oModel.create("/WorkerDeployments", oWorkerDeployment, {
						success: function (oData) {
							// set the association from worker to WorkerDeployments
							oModel.setProperty("deployment_ID", oData.ID, oWorkerBC);
							oModel.submitChanges({
								success: function (oResponse) {
									oViewModel.setProperty("/busy", false);
									oList.getBinding("items").refresh(); // otherwise the last deployed worker stays in the list
								},
								error: function () {
									oViewModel.setProperty("/busy", false);
								}
							});
						},
						error: function () {
							oViewModel.setProperty("/busy", false);
						}
					});
				});
			}, Promise.resolve());
		},

		// update the appView model so that dates are available in detail controller for drop action
		handleChange: function () {
			this.getModel("appView").setProperty("/deploymentStart", this.byId("DPStart").getDateValue());
			this.getModel("appView").setProperty("/deploymentEnd", this.byId("DPEnd").getDateValue());
		},

		onSearch: function (oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.byId("workersList").getBinding("items").refresh();
				return;
			}

			var sQuery = oEvent.getParameter("query"),
				aSearch, aFilters;

			if (sQuery) {
				aSearch = new Filter("profession/description", FilterOperator.Contains, sQuery);
				aFilters = [new Filter({
					filters: [
						this.initialFilter,
						aSearch
					],
					and: true
				})];
			} else {
				aFilters = this.initialFilter;
			}
			this.byId("workersList").getBinding("items").filter(aFilters, "Application");
		},

		onCloseDetailPress: function () {
			var sProjectID = this.getModel("appView").getProperty("/selectedProjectID");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", false);
			this.getRouter().navTo("object", {
				objectId: sProjectID
			});
		},

		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/endColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "EndColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}

	});

});