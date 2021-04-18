sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/vk/ContentResource",
	"sap/ui/vk/ContentConnector",
	"sap/ui/vk/dvl/ViewStateManager"
], function (BaseController, JSONModel, ContentResource, ContentConnector, ViewStateManager) {
	"use strict";

	return BaseController.extend("cockpit.Cockpit.controller.BIM", {

		onInit: function () {
			var oViewModel = new JSONModel({
				loaderBoxVisible: false
			});
			this.setModel(oViewModel, "BIMModel");
		},

		loadModelIntoViewer: function (viewer, remoteUrl, sourceType, localFile) {
			// what is currently loaded in the view is destroyed
			viewer.destroyContentResources();

			var source = remoteUrl || localFile;

			if (source) {
				// content of viewer is replaced with new data
				var contentResource = new ContentResource({
					source: source,
					sourceType: sourceType,
					sourceId: "abc"
				});

				// content: chosen path. content added to the view
				viewer.addContentResource(contentResource);
				this.getModel("BIMModel").setProperty("/loaderBoxVisible", false);
			}
		},

		onFileSelected: function (oEvent) {
			var viewer = this.byId("viewer");
			var localFile = oEvent.getParameter("files")[0];
			// if user selects a local file
			if (localFile) {
				var fileName = localFile.name;
				var index = fileName.lastIndexOf(".");
				if (index >= 0 && index < fileName.length - 1) {
					var sourceType = fileName.substr(index + 1);
					this.loadModelIntoViewer(viewer, null, sourceType, localFile);
				}
			}
		},

		onNodeClicked: function (oEvent) {
			var oNodeID = oEvent.getParameter("nodeRef"),
				oSource = oEvent.getSource(),
				oViewer = this.byId("viewer");
		},

		onCloseBIMPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			this.getModel("appView").setProperty("/mode", "None");
			// No item should be selected on master after detail page is closed
			//this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.getRouter().navTo("object", {
				no: 1
			});
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
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